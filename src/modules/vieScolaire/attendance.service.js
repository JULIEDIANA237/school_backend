const mongoose = require("mongoose");
const AttendanceSession = require("./attendanceSession.model");
const AttendanceRecord = require("./attendanceRecord.model");
const JustificationFile = require("./justificationFile.model");
const Student = require("../students/student.model");
const ClassModel = require("../classes/class.model");
const Subject = require("../subjects/subject.model");
const User = require("../users/user.model");
const { httpError } = require("../../utils/httpError");
const { isTeacherOfClass, assertStudentAccess, canViewVieScolaire } = require("../../utils/access");
const { ADMIN_READ_ONLY, loadScope, classCondition, assertCanAct, supervisesClass, viewsClass } = require("./scope");
const { schoolDay } = require("../../utils/school");
const { TIME, assertDay, shiftDay, formatDay, resolveRange, loadCurrentYear } = require("./days");
const { getSettings } = require("./settings.service");
const notify = require("./notify");

/** Au-delà, seul un membre de la vie scolaire peut créer ou corriger un appel. */
const TEACHER_EDIT_DAYS = 7;
const MAX_FILE_BYTES = 600 * 1024;
const FILE_DATA_URL = /^data:(image\/(?:png|jpeg|webp)|application\/pdf);base64,([A-Za-z0-9+/]+=*)$/;

const idOf = (value) => String(value?._id ?? value);
const round2 = (n) => Math.round(n * 100) / 100;
const fullName = (p) => (p ? `${p.lastName} ${p.firstName}` : undefined);

const assertObjectId = (value, label) => {
  if (!mongoose.isValidObjectId(value)) throw httpError(400, `${label} invalide.`);
};

const parseHours = (value, { min, max }) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw httpError(400, `Durée invalide (entre ${min} et ${max} h).`);
  return Math.round(n * 4) / 4;
};

const parseMinutes = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 600) throw httpError(400, "Minutes de retard invalides (entre 1 et 600).");
  return n;
};

const parseText = (value, max, label) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw httpError(400, `${label} invalide.`);
  const text = value.trim();
  if (text.length > max) throw httpError(400, `${label} trop long (${max} caractères maximum).`);
  return text;
};

/**
 * L'enseignant fait l'appel de ses classes (et de ses matières) ; le surveillant général, celui des
 * classes qui lui sont confiées. L'administrateur ne fait pas l'appel.
 * @returns {Promise<boolean>} vrai si l'utilisateur est le surveillant général de la classe
 */
const assertCanTakeAttendance = async (user, classId, subjectId) => {
  assertObjectId(classId, "Identifiant de classe");
  if (user.role === "admin") throw httpError(403, ADMIN_READ_ONLY, "VIE_SCOLAIRE_READ_ONLY");
  if (await supervisesClass(user, classId)) return true;
  if (user.role === "teacher" && (await isTeacherOfClass(user.id, classId, subjectId ? { subjectId } : {}))) return false;
  throw httpError(403, subjectId ? "Vous n'enseignez pas cette matière dans cette classe." : "Cette classe ne vous est pas confiée.");
};

const assertAttendanceDay = (day, supervising) => {
  assertDay(day);
  const today = schoolDay();
  if (day > today) throw httpError(400, "Impossible de faire l'appel d'un jour à venir.");
  if (!supervising && day < shiftDay(today, -TEACHER_EDIT_DAYS)) {
    throw httpError(403, `Un appel de plus de ${TEACHER_EDIT_DAYS} jours ne peut être modifié que par la vie scolaire.`);
  }
};

const activeStudents = (classId) =>
  Student.find({ class: classId, isActive: true })
    .select("firstName lastName gender matricule")
    .sort({ lastName: 1, firstName: 1 })
    .lean();

/** Représentation commune d'une absence ou d'un retard. */
const toRecordDTO = (r) => ({
  id: idOf(r._id),
  studentId: idOf(r.student),
  studentName: r.student?.lastName ? fullName(r.student) : undefined,
  classId: idOf(r.class),
  className: r.class?.name,
  day: r.day,
  startTime: r.startTime || null,
  kind: r.kind,
  hours: r.hours || 0,
  minutesLate: r.minutesLate ?? null,
  justified: Boolean(r.justified),
  reason: r.reason || "",
  subjectName: r.subject?.name || null,
  source: r.source,
  recordedBy: r.recordedBy?.lastName ? fullName(r.recordedBy) : undefined,
  justification: {
    status: r.justification?.status || "none",
    message: r.justification?.message || "",
    fileId: r.justification?.file ? idOf(r.justification.file) : null,
    submittedAt: r.justification?.submittedAt || null,
    reviewNote: r.justification?.reviewNote || "",
  },
  createdAt: r.createdAt,
});

const populateRecord = (query) =>
  query
    .populate("student", "firstName lastName gender")
    .populate("class", "name")
    .populate("subject", "name")
    .populate("recordedBy", "firstName lastName");

/* ============================ APPEL ============================ */

/** Classes de la vie scolaire (année demandée, sinon courante) : celles du surveillant, ou toutes pour l'administrateur. */
const listClasses = async (user, schoolYearId) => {
  let yearId = mongoose.isValidObjectId(schoolYearId) ? schoolYearId : null;
  if (!yearId) yearId = (await loadCurrentYear()).year?._id;
  if (!yearId) return [];
  const filter = { schoolYearId: yearId, isActive: { $ne: false } };
  const scope = await loadScope(user);
  if (scope) filter._id = { $in: scope };
  const classes = await ClassModel.find(filter).select("name level").sort({ name: 1 }).lean();
  return classes.map((c) => ({ id: idOf(c._id), name: c.name, level: c.level }));
};

/** Élèves de la classe et appel déjà enregistré pour ce créneau. */
const getRoster = async (user, { classId, day, startTime } = {}) => {
  const supervising = await assertCanTakeAttendance(user, classId);
  const [settings, students] = await Promise.all([getSettings(), activeStudents(classId)]);

  let session = null;
  let entries = [];
  if (day && startTime) {
    assertDay(day);
    if (!TIME.test(startTime)) throw httpError(400, "Heure invalide (HH:MM).");
    session = await AttendanceSession.findOne({ class: classId, day, startTime })
      .populate("takenBy", "firstName lastName")
      .populate("subject", "name")
      .lean();
    if (session) {
      const records = await AttendanceRecord.find({ session: session._id }).select("student kind minutesLate justified").lean();
      entries = records.map((r) => ({
        studentId: idOf(r.student),
        status: r.kind === "late" ? "late" : "absent",
        minutesLate: r.minutesLate ?? null,
        justified: Boolean(r.justified),
      }));
    }
  }

  return {
    students: students.map((s) => ({
      id: idOf(s._id),
      firstName: s.firstName,
      lastName: s.lastName,
      gender: s.gender || null,
      matricule: s.matricule,
    })),
    defaultHours: settings.defaultSessionHours,
    session: session && {
      id: idOf(session._id),
      day: session.day,
      startTime: session.startTime,
      hours: session.hours,
      subject: session.subject ? { id: idOf(session.subject), name: session.subject.name } : null,
      takenBy: fullName(session.takenBy) || null,
      takenByMe: idOf(session.takenBy) === user.id,
      updatedAt: session.updatedAt,
    },
    entries,
    // Surveillant général de la classe (ou administrateur) : peut corriger l'appel d'un collègue et les appels anciens
    supervising,
  };
};

/**
 * Enregistre (ou corrige) l'appel d'un créneau. Seuls les absents et les retards sont transmis ;
 * les parents sont prévenus des nouveaux signalements et des corrections.
 */
const saveSession = async (user, body = {}) => {
  const { classId } = body;
  const subjectId = body.subjectId || null;
  if (subjectId) assertObjectId(subjectId, "Identifiant de matière");
  const supervising = await assertCanTakeAttendance(user, classId, subjectId);

  const { day } = body;
  assertAttendanceDay(day, supervising);
  const startTime = String(body.startTime || "");
  if (!TIME.test(startTime)) throw httpError(400, "Heure de début invalide (HH:MM).");
  const hours = parseHours(body.hours, { min: 0.5, max: 8 });
  if (!Array.isArray(body.entries) || body.entries.length > 300) {
    throw httpError(400, "entries doit être la liste des absents et des retards (300 au maximum).");
  }

  const [classDoc, subject, students] = await Promise.all([
    ClassModel.findById(classId).select("name").lean(),
    subjectId ? Subject.findById(subjectId).select("name").lean() : null,
    activeStudents(classId),
  ]);
  if (!classDoc) throw httpError(404, "Classe introuvable.");
  if (subjectId && !subject) throw httpError(404, "Matière introuvable.");

  const studentsById = new Map(students.map((s) => [idOf(s._id), s]));
  const marked = new Map();
  for (const entry of body.entries) {
    const studentId = String(entry?.studentId || "");
    if (!studentsById.has(studentId)) throw httpError(400, "Un élève de la liste n'appartient pas (ou plus) à cette classe.");
    if (entry.status !== "absent" && entry.status !== "late") throw httpError(400, "Statut invalide (absent ou late).");
    marked.set(studentId, { kind: entry.status === "late" ? "late" : "absence", minutesLate: entry.status === "late" ? parseMinutes(entry.minutesLate) : null });
  }

  const existing = await AttendanceSession.findOne({ class: classId, day, startTime }).lean();
  if (existing && idOf(existing.takenBy) !== user.id && !supervising) {
    const author = await User.findById(existing.takenBy).select("firstName lastName").lean();
    throw httpError(409, `L'appel de ce créneau a déjà été fait${author ? ` par ${author.firstName} ${author.lastName}` : ""}.`);
  }

  const kinds = [...marked.values()].map((m) => m.kind);
  const session = await AttendanceSession.findOneAndUpdate(
    { class: classId, day, startTime },
    {
      $set: {
        hours,
        studentCount: students.length,
        absentCount: kinds.filter((k) => k === "absence").length,
        lateCount: kinds.filter((k) => k === "late").length,
        ...(subjectId && { subject: subjectId }),
      },
      $setOnInsert: { takenBy: user.id },
    },
    { upsert: true, returnDocument: "after" },
  ).lean();
  const sessionSubject = subject || (session.subject ? await Subject.findById(session.subject).select("name").lean() : null);

  const previous = await AttendanceRecord.find({ session: session._id }).lean();
  const removed = previous.filter((r) => !marked.has(idOf(r.student)));
  const ops = [...marked].map(([studentId, m]) => ({
    updateOne: {
      filter: { session: session._id, student: studentId },
      update: {
        $set: {
          class: classId,
          day,
          startTime,
          kind: m.kind,
          hours: m.kind === "absence" ? hours : 0,
          ...(session.subject && { subject: session.subject }),
          ...(m.minutesLate !== null && { minutesLate: m.minutesLate }),
        },
        ...(m.minutesLate === null && { $unset: { minutesLate: 1 } }),
        $setOnInsert: { source: "appel", recordedBy: user.id, justified: false, "justification.status": "none" },
      },
      upsert: true,
    },
  }));
  if (ops.length) await AttendanceRecord.bulkWrite(ops, { ordered: false });
  if (removed.length) {
    const removedIds = removed.map((r) => r._id);
    await Promise.all([
      AttendanceRecord.deleteMany({ _id: { $in: removedIds } }),
      JustificationFile.deleteMany({ record: { $in: removedIds } }),
    ]);
  }

  // Parents : nouveaux signalements (ou changement absence ↔ retard) et corrections
  const settings = await getSettings();
  const current = await AttendanceRecord.find({ session: session._id }).lean();
  const context = { startTime, subjectName: sessionSubject?.name, className: classDoc.name };
  const toNotify = current.filter(
    (r) => r.parentNotifiedKind !== r.kind && !r.justified && (r.kind === "absence" ? settings.notifyAbsence : settings.notifyLate),
  );
  const messages = [
    ...toNotify.map((r) => notify.recordMessage(r, studentsById.get(idOf(r.student)), context)),
    ...removed
      .filter((r) => r.parentNotifiedKind && studentsById.has(idOf(r.student)))
      .map((r) => notify.correctionMessage(r, studentsById.get(idOf(r.student)), context)),
  ];
  const notified = await notify.notifyParents(messages);
  for (const kind of ["absence", "late"]) {
    const ids = toNotify.filter((r) => r.kind === kind).map((r) => r._id);
    if (ids.length) await AttendanceRecord.updateMany({ _id: { $in: ids } }, { $set: { parentNotifiedKind: kind } });
  }

  return {
    session: {
      id: idOf(session._id),
      day,
      startTime,
      hours,
      className: classDoc.name,
      subjectName: sessionSubject?.name || null,
      studentCount: session.studentCount,
      absentCount: session.absentCount,
      lateCount: session.lateCount,
    },
    notifiedParents: notified,
    removed: removed.length,
  };
};

/** Derniers appels faits par l'utilisateur (historique de l'enseignant). */
const mySessions = async (user) => {
  const since = shiftDay(schoolDay(), -30);
  const sessions = await AttendanceSession.find({ takenBy: user.id, day: { $gte: since } })
    .sort({ day: -1, startTime: -1 })
    .limit(40)
    .populate("class", "name")
    .populate("subject", "name")
    .lean();
  return sessions.map((s) => ({
    id: idOf(s._id),
    day: s.day,
    startTime: s.startTime,
    hours: s.hours,
    classId: idOf(s.class),
    className: s.class?.name,
    subjectId: s.subject ? idOf(s.subject) : null,
    subjectName: s.subject?.name || null,
    studentCount: s.studentCount,
    absentCount: s.absentCount,
    lateCount: s.lateCount,
    updatedAt: s.updatedAt,
  }));
};

/* ===================== ABSENCES ET RETARDS (VIE SCOLAIRE) ===================== */

const listRecords = async (user, query = {}) => {
  const filter = {};
  const range = await resolveRange(query);
  filter.day = { $gte: range.from, $lte: range.to };
  const classFilter = classCondition(await loadScope(user), query.classId);
  if (classFilter) filter.class = classFilter;
  if (query.studentId) {
    assertObjectId(query.studentId, "Identifiant d'élève");
    filter.student = query.studentId;
  }
  if (query.kind) {
    if (!AttendanceRecord.RECORD_KINDS.includes(query.kind)) throw httpError(400, "Type invalide.");
    filter.kind = query.kind;
  }
  if (query.justified === "true" || query.justified === "false") filter.justified = query.justified === "true";
  if (query.status) {
    if (!AttendanceRecord.JUSTIFICATION_STATUSES.includes(query.status)) throw httpError(400, "Statut invalide.");
    filter["justification.status"] = query.status;
    // Les justificatifs en attente se traitent quelle que soit leur date
    if (query.status === "pending" && !query.periodId && !query.from) delete filter.day;
  }
  const records = await populateRecord(AttendanceRecord.find(filter).sort({ day: -1, startTime: -1, createdAt: -1 }).limit(500)).lean();
  return { range, records: records.map(toRecordDTO) };
};

/** Saisie directe par la vie scolaire (absence d'une journée, retard au portail…). */
const createRecord = async (user, body = {}) => {
  assertObjectId(body.studentId, "Identifiant d'élève");
  const student = await Student.findById(body.studentId).select("firstName lastName gender class isActive").lean();
  if (!student || !student.isActive) throw httpError(404, "Élève introuvable.");
  await assertCanAct(user, student.class, "Élève introuvable dans vos classes.");
  assertDay(body.day);
  if (body.day > schoolDay()) throw httpError(400, "La date ne peut pas être dans le futur.");
  if (!AttendanceRecord.RECORD_KINDS.includes(body.kind)) throw httpError(400, "Type invalide (absence ou late).");
  if (body.startTime && !TIME.test(body.startTime)) throw httpError(400, "Heure invalide (HH:MM).");
  if (body.subjectId) assertObjectId(body.subjectId, "Identifiant de matière");

  const isAbsence = body.kind === "absence";
  const record = await AttendanceRecord.create({
    student: student._id,
    class: student.class,
    day: body.day,
    startTime: body.startTime || undefined,
    subject: body.subjectId || undefined,
    kind: body.kind,
    hours: isAbsence ? parseHours(body.hours, { min: 0.5, max: 12 }) : 0,
    minutesLate: isAbsence ? undefined : parseMinutes(body.minutesLate) ?? undefined,
    justified: body.justified === true,
    reason: parseText(body.reason, 300, "Motif"),
    source: "manual",
    recordedBy: user.id,
  });

  const settings = await getSettings();
  if (!record.justified && (isAbsence ? settings.notifyAbsence : settings.notifyLate)) {
    const classDoc = await ClassModel.findById(student.class).select("name").lean();
    await notify.notifyParents([notify.recordMessage(record, student, { startTime: record.startTime, className: classDoc?.name })]);
    await AttendanceRecord.updateOne({ _id: record._id }, { $set: { parentNotifiedKind: record.kind } });
  }
  return toRecordDTO(await populateRecord(AttendanceRecord.findById(record._id)).lean());
};

/** Justifier, corriger la durée ou le motif. */
const updateRecord = async (user, recordId, body = {}) => {
  assertObjectId(recordId, "Identifiant");
  const record = await AttendanceRecord.findById(recordId);
  if (!record) throw httpError(404, "Absence ou retard introuvable.");
  await assertCanAct(user, record.class, "Absence ou retard introuvable.");

  if (body.justified !== undefined) {
    if (typeof body.justified !== "boolean") throw httpError(400, "Valeur « justifié » invalide.");
    record.justified = body.justified;
    // Justifiée par la vie scolaire : un justificatif en attente est considéré comme accepté
    if (body.justified && record.justification?.status === "pending") {
      record.justification.status = "accepted";
      record.justification.reviewedBy = user.id;
      record.justification.reviewedAt = new Date();
    }
  }
  const reason = parseText(body.reason, 300, "Motif");
  if (reason !== undefined) record.reason = reason;
  if (body.hours !== undefined && record.kind === "absence") record.hours = parseHours(body.hours, { min: 0.5, max: 12 });
  if (body.minutesLate !== undefined && record.kind === "late") record.minutesLate = parseMinutes(body.minutesLate) ?? undefined;
  await record.save();
  return toRecordDTO(await populateRecord(AttendanceRecord.findById(record._id)).lean());
};

const deleteRecord = async (user, recordId) => {
  assertObjectId(recordId, "Identifiant");
  const found = await AttendanceRecord.findById(recordId).select("class").lean();
  if (!found) throw httpError(404, "Absence ou retard introuvable.");
  await assertCanAct(user, found.class, "Absence ou retard introuvable.");
  const record = await AttendanceRecord.findByIdAndDelete(recordId);
  if (!record) throw httpError(404, "Absence ou retard introuvable.");
  await JustificationFile.deleteMany({ record: record._id });
  if (record.session) {
    const field = record.kind === "late" ? "lateCount" : "absentCount";
    await AttendanceSession.updateOne({ _id: record.session, [field]: { $gt: 0 } }, { $inc: { [field]: -1 } });
  }
  return { deleted: true };
};

/* ============================ JUSTIFICATIFS ============================ */

const parseFile = (dataUrl) => {
  if (dataUrl === undefined || dataUrl === null || dataUrl === "") return null;
  const match = typeof dataUrl === "string" ? FILE_DATA_URL.exec(dataUrl) : null;
  if (!match) throw httpError(400, "Pièce jointe invalide : photo (JPEG, PNG, WebP) ou PDF.");
  const data = Buffer.from(match[2], "base64");
  if (data.length > MAX_FILE_BYTES) throw httpError(400, "Pièce jointe trop lourde (600 Ko maximum).");
  return { mime: match[1], data };
};

/** Le parent envoie (ou remplace) le justificatif d'une absence ou d'un retard de son enfant. */
const submitJustification = async (user, recordId, body = {}) => {
  assertObjectId(recordId, "Identifiant");
  const record = await AttendanceRecord.findById(recordId);
  if (!record) throw httpError(404, "Absence ou retard introuvable.");
  await assertStudentAccess(user, record.student);
  if (record.justified) throw httpError(409, "Cette absence est déjà justifiée.");

  const message = parseText(body.message, 1000, "Message") || "";
  const file = parseFile(body.file);
  if (message.length < 3 && !file) throw httpError(400, "Expliquez le motif ou joignez une photo du justificatif.");

  let fileId = null;
  if (file) {
    await JustificationFile.deleteMany({ record: record._id });
    const saved = await JustificationFile.create({
      record: record._id,
      student: record.student,
      uploadedBy: user.id,
      mime: file.mime,
      size: file.data.length,
      data: file.data,
    });
    fileId = saved._id;
  } else if (record.justification?.status === "pending") {
    fileId = record.justification.file || null; // nouveau message, même pièce jointe
  } else {
    await JustificationFile.deleteMany({ record: record._id });
  }

  record.justification = {
    status: "pending",
    message,
    file: fileId || undefined,
    submittedBy: user.id,
    submittedAt: new Date(),
  };
  await record.save();

  const [student, classDoc] = await Promise.all([
    Student.findById(record.student).select("firstName lastName").lean(),
    ClassModel.findById(record.class).select("name").lean(),
  ]);
  await notify.notifyVieScolaire({
    classId: record.class,
    title: `Justificatif reçu : ${fullName(student)}${classDoc ? ` (${classDoc.name})` : ""}`,
    message: `Un parent a envoyé un justificatif pour le ${formatDay(record.day)}.`,
  });
  return toRecordDTO(await populateRecord(AttendanceRecord.findById(record._id)).lean());
};

/** La vie scolaire accepte (l'absence devient justifiée) ou refuse le justificatif. */
const reviewJustification = async (user, recordId, body = {}) => {
  assertObjectId(recordId, "Identifiant");
  if (body.decision !== "accept" && body.decision !== "reject") throw httpError(400, "Décision invalide (accept ou reject).");
  const record = await AttendanceRecord.findById(recordId);
  if (!record) throw httpError(404, "Absence ou retard introuvable.");
  await assertCanAct(user, record.class, "Absence ou retard introuvable.");
  if (record.justification?.status !== "pending") throw httpError(409, "Aucun justificatif en attente pour cette absence.");

  const note = parseText(body.note, 300, "Commentaire") || "";
  const accepted = body.decision === "accept";
  record.justification.status = accepted ? "accepted" : "rejected";
  record.justification.reviewedBy = user.id;
  record.justification.reviewedAt = new Date();
  record.justification.reviewNote = note;
  if (accepted) {
    record.justified = true;
    if (!record.reason) record.reason = note || "Justificatif du parent";
  }
  await record.save();

  const student = await Student.findById(record.student).select("firstName gender").lean();
  if (student) await notify.notifyParents([notify.reviewMessage(record, student, accepted, note)]);
  return toRecordDTO(await populateRecord(AttendanceRecord.findById(record._id)).lean());
};

/** Pièce jointe : visible par la vie scolaire de la classe et par les parents de l'élève. */
const getFile = async (user, fileId) => {
  assertObjectId(fileId, "Identifiant");
  // Document complet (pas lean) : le contenu est alors un vrai Buffer
  const file = await JustificationFile.findById(fileId);
  if (!file) throw httpError(404, "Pièce jointe introuvable.");
  if (user.role === "parent") {
    await assertStudentAccess(user, file.student);
  } else {
    const record = await AttendanceRecord.findById(file.record).select("class").lean();
    if (!record || !(await viewsClass(user, record.class))) {
      throw canViewVieScolaire(user) ? httpError(404, "Pièce jointe introuvable.") : httpError(403, "Accès interdit.");
    }
  }
  return { mime: file.mime, data: Buffer.from(file.data) };
};

module.exports = {
  TEACHER_EDIT_DAYS,
  toRecordDTO,
  populateRecord,
  listClasses,
  getRoster,
  saveSession,
  mySessions,
  listRecords,
  createRecord,
  updateRecord,
  deleteRecord,
  submitJustification,
  reviewJustification,
  getFile,
};
