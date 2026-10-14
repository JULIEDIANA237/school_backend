const mongoose = require("mongoose");
const AttendanceRecord = require("./attendanceRecord.model");
const AttendanceSession = require("./attendanceSession.model");
const DisciplineIncident = require("./disciplineIncident.model");
const Student = require("../students/student.model");
const ClassModel = require("../classes/class.model");
const { httpError } = require("../../utils/httpError");
const { assertStudentAccess } = require("../../utils/access");
const { loadScope, classCondition, assertCanAct, viewsClass } = require("./scope");
const { schoolDay } = require("../../utils/school");
const { assertDay, periodRange, resolveRange, currentPeriodRange, currentYearRange, loadCurrentYear } = require("./days");
const { getSettings, conductProposals } = require("./settings.service");
const { toRecordDTO, populateRecord } = require("./attendance.service");
const notify = require("./notify");

const idOf = (value) => String(value?._id ?? value);
const round2 = (n) => Math.round(n * 100) / 100;
const fullName = (p) => (p ? `${p.lastName} ${p.firstName}` : undefined);
const toObjectIds = (ids) => ids.map((id) => new mongoose.Types.ObjectId(String(id)));

const assertObjectId = (value, label) => {
  if (!mongoose.isValidObjectId(value)) throw httpError(400, `${label} invalide.`);
};

/* ============================ TOTAUX ============================ */

const emptySummary = () => ({
  justifiedHours: 0,
  unjustifiedHours: 0,
  totalHours: 0,
  lateCount: 0,
  detentionHours: 0,
  exclusionDays: 0,
  warningCount: 0,
  blameCount: 0,
});

/**
 * Totaux d'assiduité et de discipline de chaque élève sur une plage de jours (bornes incluses) :
 * deux agrégations, quel que soit le nombre d'élèves.
 * @returns {Promise<Map<string, ReturnType<typeof emptySummary>>>}
 */
const summarize = async (studentIds, { from, to }) => {
  const summaries = new Map(studentIds.map((id) => [idOf(id), emptySummary()]));
  if (!studentIds.length) return summaries;
  const match = { student: { $in: toObjectIds(studentIds) }, day: { $gte: from, $lte: to } };
  const isAbsence = { $eq: ["$kind", "absence"] };
  const [attendance, incidents] = await Promise.all([
    AttendanceRecord.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$student",
          justifiedHours: { $sum: { $cond: [{ $and: [isAbsence, { $eq: ["$justified", true] }] }, "$hours", 0] } },
          unjustifiedHours: { $sum: { $cond: [{ $and: [isAbsence, { $ne: ["$justified", true] }] }, "$hours", 0] } },
          lateCount: { $sum: { $cond: [{ $eq: ["$kind", "late"] }, 1, 0] } },
        },
      },
    ]),
    DisciplineIncident.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$student",
          detentionHours: { $sum: { $cond: [{ $eq: ["$type", "retenue"] }, { $ifNull: ["$hours", 0] }, 0] } },
          exclusionDays: { $sum: { $cond: [{ $eq: ["$type", "exclusion"] }, { $ifNull: ["$days", 0] }, 0] } },
          warningCount: { $sum: { $cond: [{ $eq: ["$type", "avertissement"] }, 1, 0] } },
          blameCount: { $sum: { $cond: [{ $eq: ["$type", "blame"] }, 1, 0] } },
        },
      },
    ]),
  ]);
  for (const row of attendance) {
    const s = summaries.get(idOf(row._id));
    if (!s) continue;
    s.justifiedHours = round2(row.justifiedHours);
    s.unjustifiedHours = round2(row.unjustifiedHours);
    s.lateCount = row.lateCount;
  }
  for (const row of incidents) {
    const s = summaries.get(idOf(row._id));
    if (!s) continue;
    Object.assign(s, {
      detentionHours: round2(row.detentionHours),
      exclusionDays: row.exclusionDays,
      warningCount: row.warningCount,
      blameCount: row.blameCount,
    });
  }
  for (const s of summaries.values()) s.totalHours = round2(s.justifiedHours + s.unjustifiedHours);
  return summaries;
};

/** Bloc « Discipline » des bulletins d'une période, figé à la génération. */
const bulletinDiscipline = (studentIds, period) => summarize(studentIds, periodRange(period));

/* ============================ SANCTIONS ============================ */

const toIncidentDTO = (i) => ({
  id: idOf(i._id),
  studentId: idOf(i.student),
  studentName: i.student?.lastName ? fullName(i.student) : undefined,
  classId: idOf(i.class),
  className: i.class?.name,
  day: i.day,
  type: i.type,
  hours: i.hours ?? null,
  days: i.days ?? null,
  reason: i.reason,
  decidedBy: i.decidedBy?.lastName ? fullName(i.decidedBy) : undefined,
  createdAt: i.createdAt,
});

const populateIncident = (query) =>
  query.populate("student", "firstName lastName").populate("class", "name").populate("decidedBy", "firstName lastName");

const listIncidents = async (user, query = {}) => {
  const range = await resolveRange(query);
  const filter = { day: { $gte: range.from, $lte: range.to } };
  const classFilter = classCondition(await loadScope(user), query.classId);
  if (classFilter) filter.class = classFilter;
  if (query.studentId) {
    assertObjectId(query.studentId, "Identifiant d'élève");
    filter.student = query.studentId;
  }
  if (query.type) {
    if (!DisciplineIncident.INCIDENT_TYPES.includes(query.type)) throw httpError(400, "Type de sanction invalide.");
    filter.type = query.type;
  }
  const incidents = await populateIncident(DisciplineIncident.find(filter).sort({ day: -1, createdAt: -1 }).limit(500)).lean();
  return { range, incidents: incidents.map(toIncidentDTO) };
};

const createIncident = async (user, body = {}) => {
  assertObjectId(body.studentId, "Identifiant d'élève");
  const student = await Student.findById(body.studentId).select("firstName lastName gender class isActive").lean();
  if (!student || !student.isActive) throw httpError(404, "Élève introuvable.");
  await assertCanAct(user, student.class, "Élève introuvable dans vos classes.");
  if (!DisciplineIncident.INCIDENT_TYPES.includes(body.type)) throw httpError(400, "Type de sanction invalide.");
  assertDay(body.day);
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < 3) throw httpError(400, "Le motif de la sanction est obligatoire.");
  if (reason.length > 500) throw httpError(400, "Motif trop long (500 caractères maximum).");

  const doc = { student: student._id, class: student.class, day: body.day, type: body.type, reason, decidedBy: user.id };
  if (body.type === "retenue") {
    const hours = Number(body.hours);
    if (!Number.isFinite(hours) || hours < 0.5 || hours > 40) throw httpError(400, "Durée de retenue invalide (entre 0,5 et 40 h).");
    doc.hours = Math.round(hours * 4) / 4;
  }
  if (body.type === "exclusion") {
    const days = Number(body.days);
    if (!Number.isInteger(days) || days < 1 || days > 30) throw httpError(400, "Durée d'exclusion invalide (entre 1 et 30 jours).");
    doc.days = days;
  }
  const incident = await DisciplineIncident.create(doc);

  if ((await getSettings()).notifyIncident) await notify.notifyParents([notify.incidentMessage(incident, student)]);
  return toIncidentDTO(await populateIncident(DisciplineIncident.findById(incident._id)).lean());
};

const deleteIncident = async (user, incidentId) => {
  assertObjectId(incidentId, "Identifiant");
  const incident = await DisciplineIncident.findById(incidentId).select("class").lean();
  if (!incident) throw httpError(404, "Sanction introuvable.");
  await assertCanAct(user, incident.class, "Sanction introuvable.");
  await DisciplineIncident.deleteOne({ _id: incident._id });
  return { deleted: true };
};

/* ============================ TABLEAU DE BORD ============================ */

/**
 * Journée en cours (absents et retards par classe), élèves au-delà des seuils du règlement
 * sur la période, justificatifs en attente et dernières sanctions.
 */
const getDashboard = async (user, query = {}) => {
  const today = schoolDay();
  const [range, settings, scope] = await Promise.all([resolveRange(query), getSettings(), loadScope(user)]);
  // Surveillant général : uniquement ses classes ; administrateur : tout l'établissement
  const classFilter = classCondition(scope);
  const inClasses = classFilter ? { class: classFilter } : {};

  const flagConditions = [];
  if (settings.alertUnjustifiedHours > 0) flagConditions.push({ unjustifiedHours: { $gte: settings.alertUnjustifiedHours } });
  if (settings.alertLateCount > 0) flagConditions.push({ lateCount: { $gte: settings.alertLateCount } });

  const [todayRows, sessionsToday, pendingJustifications, recentIncidents, flagged] = await Promise.all([
    AttendanceRecord.aggregate([
      { $match: { day: today, ...inClasses } },
      { $group: { _id: { class: "$class", kind: "$kind" }, students: { $addToSet: "$student" } } },
    ]),
    AttendanceSession.countDocuments({ day: today, ...inClasses }),
    AttendanceRecord.countDocuments({ "justification.status": "pending", ...inClasses }),
    populateIncident(
      DisciplineIncident.find({ day: { $gte: range.from, $lte: range.to }, ...inClasses }).sort({ day: -1, createdAt: -1 }).limit(8),
    ).lean(),
    flagConditions.length
      ? AttendanceRecord.aggregate([
          { $match: { day: { $gte: range.from, $lte: range.to }, ...inClasses } },
          {
            $group: {
              _id: "$student",
              unjustifiedHours: {
                $sum: { $cond: [{ $and: [{ $eq: ["$kind", "absence"] }, { $ne: ["$justified", true] }] }, "$hours", 0] },
              },
              lateCount: { $sum: { $cond: [{ $eq: ["$kind", "late"] }, 1, 0] } },
            },
          },
          { $match: { $or: flagConditions } },
          { $sort: { unjustifiedHours: -1, lateCount: -1 } },
          { $limit: 100 },
        ])
      : [],
  ]);

  // Journée : élèves distincts par classe
  const byClass = new Map();
  const absentToday = new Set();
  const lateToday = new Set();
  for (const row of todayRows) {
    const key = idOf(row._id.class);
    if (!byClass.has(key)) byClass.set(key, { classId: key, absent: 0, late: 0 });
    const entry = byClass.get(key);
    if (row._id.kind === "absence") {
      entry.absent += row.students.length;
      row.students.forEach((s) => absentToday.add(idOf(s)));
    } else {
      entry.late += row.students.length;
      row.students.forEach((s) => lateToday.add(idOf(s)));
    }
  }
  const classNames = new Map(
    (await ClassModel.find({ _id: { $in: [...byClass.keys()] } }).select("name").lean()).map((c) => [idOf(c._id), c.name]),
  );

  // Élèves signalés : totaux complets (sanctions comprises) et décision proposée
  const flaggedIds = flagged.map((f) => f._id);
  const [summaries, flaggedStudents] = await Promise.all([
    summarize(flaggedIds, range),
    Student.find({ _id: { $in: flaggedIds } }).select("firstName lastName class").populate("class", "name").lean(),
  ]);
  const studentsById = new Map(flaggedStudents.map((s) => [idOf(s._id), s]));
  const alerts = flagged
    .map((f) => {
      const student = studentsById.get(idOf(f._id));
      if (!student) return null;
      const summary = summaries.get(idOf(f._id));
      return {
        studentId: idOf(f._id),
        studentName: fullName(student),
        classId: idOf(student.class),
        className: student.class?.name,
        ...summary,
        overHours: settings.alertUnjustifiedHours > 0 && summary.unjustifiedHours >= settings.alertUnjustifiedHours,
        overLates: settings.alertLateCount > 0 && summary.lateCount >= settings.alertLateCount,
        proposals: conductProposals(summary, settings),
      };
    })
    .filter(Boolean);

  // Administration : classes de l'année sans surveillant général (personne n'y fait le suivi)
  let classesWithoutSupervisor = [];
  if (scope === null) {
    const { year } = await loadCurrentYear();
    if (year) {
      const orphans = await ClassModel.find({ schoolYearId: year._id, isActive: { $ne: false }, supervisor: { $exists: false } })
        .select("name")
        .sort({ name: 1 })
        .lean();
      classesWithoutSupervisor = orphans.map((c) => ({ id: idOf(c._id), name: c.name }));
    }
  }

  return {
    today,
    range,
    settings,
    // Nombre de classes suivies (null : toutes, pour l'administrateur)
    supervisedClasses: scope === null ? null : scope.length,
    classesWithoutSupervisor,
    todayStats: {
      sessions: sessionsToday,
      absentStudents: absentToday.size,
      lateStudents: lateToday.size,
      byClass: [...byClass.values()]
        .map((c) => ({ ...c, className: classNames.get(c.classId) || "—" }))
        .sort((a, b) => a.className.localeCompare(b.className, "fr")),
    },
    pendingJustifications,
    alerts,
    recentIncidents: recentIncidents.map(toIncidentDTO),
  };
};

/* ============================ FICHES ============================ */

/** Fiche d'un élève : totaux, absences et sanctions de la période (vie scolaire, enseignant, parent). */
const getStudentSummary = async (user, studentId, query = {}) => {
  assertObjectId(studentId, "Identifiant d'élève");
  const student = await Student.findById(studentId).select("firstName lastName class").populate("class", "name").lean();
  // Administration et surveillant général de la classe : fiche complète ; sinon les règles habituelles (enseignant, parent…)
  const supervising = Boolean(student && (await viewsClass(user, student.class?._id)));
  if (!supervising) await assertStudentAccess(user, studentId);
  if (!student) throw httpError(404, "Élève introuvable.");
  const [range, settings] = await Promise.all([resolveRange(query), getSettings()]);
  const filter = { student: student._id, day: { $gte: range.from, $lte: range.to } };
  const [summaries, records, incidents] = await Promise.all([
    summarize([student._id], range),
    populateRecord(AttendanceRecord.find(filter).sort({ day: -1, startTime: -1 }).limit(300)).lean(),
    populateIncident(DisciplineIncident.find(filter).sort({ day: -1 }).limit(100)).lean(),
  ]);
  const summary = summaries.get(idOf(student._id));
  return {
    range,
    student: { id: idOf(student._id), name: fullName(student), className: student.class?.name },
    summary,
    proposals: supervising ? conductProposals(summary, settings) : [],
    records: records.map(toRecordDTO),
    incidents: incidents.map(toIncidentDTO),
  };
};

/** Espace parent : chaque enfant, ses totaux (période en cours et année) et son historique de l'année. */
const getParentOverview = async (user) => {
  const children = await Student.find({ parents: user.id, isActive: true })
    .select("firstName lastName gender class")
    .populate("class", "name")
    .sort({ firstName: 1 })
    .lean();
  const [year, period] = await Promise.all([currentYearRange(), currentPeriodRange()]);
  const ids = children.map((c) => c._id);
  const filter = { student: { $in: ids }, day: { $gte: year.from, $lte: year.to } };
  const [yearTotals, periodTotals, records, incidents] = await Promise.all([
    summarize(ids, year),
    summarize(ids, period),
    AttendanceRecord.find(filter).sort({ day: -1, startTime: -1 }).limit(1000).populate("subject", "name").lean(),
    DisciplineIncident.find(filter).sort({ day: -1 }).limit(300).lean(),
  ]);

  return {
    year,
    period,
    children: children.map((child) => {
      const key = idOf(child._id);
      return {
        id: key,
        firstName: child.firstName,
        lastName: child.lastName,
        gender: child.gender || null,
        className: child.class?.name || null,
        totals: { period: periodTotals.get(key), year: yearTotals.get(key) },
        records: records.filter((r) => idOf(r.student) === key).slice(0, 150).map(toRecordDTO),
        incidents: incidents
          .filter((i) => idOf(i.student) === key)
          .map((i) => {
            const { decidedBy, ...dto } = toIncidentDTO(i);
            return dto;
          }),
      };
    }),
  };
};

module.exports = {
  emptySummary,
  summarize,
  bulletinDiscipline,
  listIncidents,
  createIncident,
  deleteIncident,
  getDashboard,
  getStudentSummary,
  getParentOverview,
};
