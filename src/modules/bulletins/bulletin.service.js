const crypto = require("crypto");
const mongoose = require("mongoose");
const { waitUntil } = require("@vercel/functions");
const Bulletin = require("./bulletin.model");
const Grade = require("../grades/grade.model");
const Evaluation = require("../evaluations/evaluation.model");
const Student = require("../students/student.model");
const Period = require("../periods/period.model");
const ClassModel = require("../classes/class.model");
const ClassSubject = require("../classes/classSubject.model");
const TeacherAssignment = require("../teachers/teacherAssignment.model");
const calc = require("./bulletin.calculator");
const { httpError } = require("../../utils/httpError");

const DECISION_CODES = ["TH", "AT", "THE", "BT", "THF", "ET", "AC", "BC", "EC"];
const idOf = (value) => String(value?._id ?? value);

const assertObjectId = (value, label) => {
  if (!mongoose.isValidObjectId(value)) throw httpError(400, `${label} invalide.`);
};

/** Matières (coefficients) de la classe pour son année scolaire, sans doublon. */
const getClassSubjects = async (classDoc) => {
  let list = await ClassSubject.find({ classId: classDoc._id, schoolYearId: classDoc.schoolYearId })
    .populate("subjectId", "name code")
    .lean();
  // Anciennes données sans année scolaire cohérente
  if (!list.length) list = await ClassSubject.find({ classId: classDoc._id }).populate("subjectId", "name code").lean();
  const seen = new Set();
  return list.filter((cs) => {
    const key = idOf(cs.subjectId);
    if (!cs.subjectId || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/** Charge tout ce qu'il faut pour calculer une classe sur une période. */
const loadContext = async (classId, periodId) => {
  assertObjectId(classId, "Identifiant de classe");
  assertObjectId(periodId, "Identifiant de période");
  const [classDoc, period] = await Promise.all([
    ClassModel.findById(classId).lean(),
    Period.findById(periodId).lean(),
  ]);
  if (!classDoc) throw httpError(404, "Classe introuvable.");
  if (!period) throw httpError(404, "Période introuvable.");

  const classSubjects = await getClassSubjects(classDoc);
  if (!classSubjects.length) {
    throw httpError(400, "Aucune matière (coefficient) n'est configurée pour cette classe.");
  }

  let sequences = [period];
  if (period.type === "TRIMESTRE") {
    sequences = await Period.find({ parentPeriod: period._id, type: "SEQUENCE" }).sort({ startDate: 1 }).lean();
    if (!sequences.length) {
      throw httpError(400, `Aucune séquence n'est rattachée au trimestre « ${period.name} ».`);
    }
  }

  const evaluations = await Evaluation.find({
    class: classDoc._id,
    period: { $in: sequences.map((s) => s._id) },
  })
    .select("_id subject period maxScore coefficient isPublished")
    .lean();

  return { classDoc, period, classSubjects, sequences, evaluations };
};

/** Calcule, sans rien enregistrer, les moyennes des élèves donnés. */
const computeForStudents = async (ctx, studentIds) => {
  const grades = await Grade.find({
    student: { $in: studentIds },
    evaluation: { $in: ctx.evaluations.map((e) => e._id) },
  })
    .select("student evaluation score")
    .lean();

  const gradesByStudent = new Map();
  for (const g of grades) {
    const key = idOf(g.student);
    if (!gradesByStudent.has(key)) gradesByStudent.set(key, []);
    gradesByStudent.get(key).push(g);
  }

  const results = new Map();
  for (const studentId of studentIds) {
    const studentGrades = gradesByStudent.get(idOf(studentId)) || [];
    let averages;
    if (ctx.period.type === "TRIMESTRE") {
      const sequenceResults = ctx.sequences.map((seq) => ({
        periodId: seq._id,
        name: seq.name,
        averages: calc.computeSequenceAverages({
          classSubjects: ctx.classSubjects,
          evaluations: ctx.evaluations.filter((e) => idOf(e.period) === idOf(seq._id)),
          grades: studentGrades,
        }),
      }));
      averages = calc.computeTrimesterAverages({ classSubjects: ctx.classSubjects, sequences: sequenceResults });
    } else {
      averages = calc.computeSequenceAverages({
        classSubjects: ctx.classSubjects,
        evaluations: ctx.evaluations,
        grades: studentGrades,
      });
    }
    results.set(idOf(studentId), { averages, generalAverage: calc.computeGeneralAverage(averages) });
  }
  return results;
};

/** Rang général et rangs par matière, avec ex æquo. */
const rankEntries = (entries) => {
  const generalRanks = calc.rankWithTies(entries.map((e) => ({ key: e.key, value: e.generalAverage })));
  const subjectIds = [...new Set(entries.flatMap((e) => e.averages.map((a) => idOf(a.subject))))];
  const subjectRanks = new Map(
    subjectIds.map((sid) => [
      sid,
      calc.rankWithTies(
        entries.map((e) => ({
          key: e.key,
          value: e.averages.find((a) => idOf(a.subject) === sid)?.average ?? null,
        })),
      ),
    ]),
  );

  return {
    classifiedCount: generalRanks.size,
    entries: entries.map((e) => ({
      ...e,
      rank: generalRanks.get(e.key) ?? null,
      averages: e.averages.map((a) => ({ ...a, rank: subjectRanks.get(idOf(a.subject)).get(e.key) ?? null })),
    })),
  };
};

const assertNotFrozen = async (classId, periodId) => {
  if (await Bulletin.exists({ class: classId, period: periodId, isPublished: true })) {
    throw httpError(
      409,
      "Des bulletins de cette classe sont déjà publiés pour cette période : dépubliez-les avant de recalculer.",
      "BULLETINS_PUBLISHED",
    );
  }
};

/**
 * Calcule et enregistre les bulletins d'une classe pour une période.
 * - Les commentaires, décisions et appréciations déjà saisis sont conservés (aucune suppression).
 * - Refusé si un bulletin de la classe est déjà publié pour la période (classement figé).
 * - Les brouillons d'élèves sortis de la classe sont retirés.
 */
const generateForClass = async (classId, periodId) => {
  const ctx = await loadContext(classId, periodId);
  await assertNotFrozen(classId, periodId);

  const students = await Student.find({ class: classId, isActive: true }).select("_id").lean();
  if (!students.length) throw httpError(400, "Aucun élève actif dans cette classe.");

  // Un élève changé de classe peut déjà avoir un bulletin publié ailleurs pour cette période.
  const publishedElsewhere = new Set(
    (
      await Bulletin.find({ period: periodId, student: { $in: students.map((s) => s._id) }, isPublished: true })
        .select("student")
        .lean()
    ).map((b) => idOf(b.student)),
  );
  const studentIds = students.map((s) => s._id).filter((id) => !publishedElsewhere.has(idOf(id)));

  const results = await computeForStudents(ctx, studentIds);
  const ranked = rankEntries(studentIds.map((id) => ({ key: idOf(id), ...results.get(idOf(id)) })));

  if (ranked.entries.length) {
    await Bulletin.bulkWrite(
      ranked.entries.map((e) => ({
        updateOne: {
          filter: { student: e.key, period: ctx.period._id },
          update: {
            $set: {
              class: ctx.classDoc._id,
              averages: e.averages,
              generalAverage: e.generalAverage,
              rank: e.rank,
              classifiedCount: ranked.classifiedCount,
            },
          },
          upsert: true,
        },
      })),
    );
  }

  const removed = await Bulletin.deleteMany({
    class: ctx.classDoc._id,
    period: ctx.period._id,
    isPublished: { $ne: true },
    student: { $nin: studentIds },
  });

  return {
    generated: ranked.entries.length,
    removed: removed.deletedCount,
    skipped: publishedElsewhere.size,
    unclassified: ranked.entries.filter((e) => e.generalAverage === null).length,
    unpublishedEvaluations: ctx.evaluations.filter((e) => !e.isPublished).length,
    periodType: ctx.period.type,
    periodName: ctx.period.name,
  };
};

/** Recalcule le bulletin d'un élève (en pratique : toute sa classe, pour garder des rangs cohérents). */
const calculateBulletin = async (studentId, classId, periodId) => {
  assertObjectId(studentId, "Identifiant d'élève");
  const student = await Student.findById(studentId).select("class isActive").lean();
  if (!student) throw httpError(404, "Élève introuvable.");
  if (idOf(student.class) !== idOf(classId) || !student.isActive) {
    throw httpError(400, "L'élève n'est pas (ou plus) inscrit dans cette classe.");
  }
  await generateForClass(classId, periodId);
  return Bulletin.findOne({ student: studentId, period: periodId });
};

/** Moyennes d'un élève, calculées à la volée (aucune écriture). */
const computeStudentAverages = async (studentId, periodId) => {
  assertObjectId(studentId, "Identifiant d'élève");
  const student = await Student.findById(studentId).select("class").lean();
  if (!student) throw httpError(404, "Élève introuvable.");
  const ctx = await loadContext(student.class, periodId);
  const result = (await computeForStudents(ctx, [student._id])).get(idOf(student._id));
  return { studentId: idOf(student._id), classId: idOf(student.class), periodId: idOf(periodId), ...result };
};

/** Classement d'une classe calculé à la volée (aucune écriture). */
const computeClassStandings = async (classId, periodId) => {
  const ctx = await loadContext(classId, periodId);
  const students = await Student.find({ class: classId, isActive: true })
    .select("_id firstName lastName")
    .lean();
  const results = await computeForStudents(ctx, students.map((s) => s._id));
  const ranked = rankEntries(students.map((s) => ({ key: idOf(s._id), ...results.get(idOf(s._id)) })));
  const names = new Map(students.map((s) => [idOf(s._id), `${s.firstName} ${s.lastName}`]));
  return {
    classDoc: ctx.classDoc,
    classifiedCount: ranked.classifiedCount,
    entries: ranked.entries.map((e) => ({ ...e, studentName: names.get(e.key) })),
  };
};

const loadForNotification = (bulletinId) =>
  Bulletin.findById(bulletinId)
    .populate({ path: "student", populate: { path: "parents" } })
    .populate("period", "name type year")
    .populate("class", "name");

const publishBulletin = async (bulletinId) => {
  assertObjectId(bulletinId, "Identifiant de bulletin");
  const NotificationService = require("../notifications/notification.service");
  const bulletin = await loadForNotification(bulletinId);
  if (!bulletin) throw httpError(404, "Bulletin introuvable.");

  bulletin.isPublished = true;
  bulletin.publishedAt = new Date();
  await bulletin.save();

  await NotificationService.notifyBulletinPublicationInApp(bulletin);
  // Emails et SMS après la réponse : waitUntil garde la fonction Vercel active jusqu'à la fin de l'envoi.
  waitUntil(
    NotificationService.sendBulletinPublicationMessages(bulletin).catch((err) =>
      console.error("[BULLETIN_NOTIFICATION_FAILURE]", err.message),
    ),
  );
  return bulletin;
};

const unpublishBulletin = async (bulletinId) => {
  assertObjectId(bulletinId, "Identifiant de bulletin");
  const bulletin = await Bulletin.findByIdAndUpdate(
    bulletinId,
    { isPublished: false, $unset: { publishedAt: 1 } },
    { returnDocument: "after" },
  );
  if (!bulletin) throw httpError(404, "Bulletin introuvable.");
  return bulletin;
};

const bulkPublishBulletins = async (classId, periodId) => {
  const NotificationService = require("../notifications/notification.service");
  const bulletins = await Bulletin.find({ class: classId, period: periodId, isPublished: { $ne: true } })
    .populate({ path: "student", populate: { path: "parents" } })
    .populate("period", "name type year")
    .populate("class", "name");
  if (!bulletins.length) return 0;

  const publishedAt = new Date();
  await Bulletin.updateMany(
    { _id: { $in: bulletins.map((b) => b._id) }, isPublished: { $ne: true } },
    { $set: { isPublished: true, publishedAt } },
  );
  bulletins.forEach((b) => {
    b.isPublished = true;
    b.publishedAt = publishedAt;
  });

  await NotificationService.notifyBulletinsPublicationInApp(bulletins);
  // Emails et SMS après la réponse, un bulletin après l'autre (voir publishBulletin)
  waitUntil(
    (async () => {
      for (const bulletin of bulletins) {
        await NotificationService.sendBulletinPublicationMessages(bulletin).catch((err) =>
          console.error("[BULLETIN_NOTIFICATION_FAILURE]", err.message),
        );
      }
    })(),
  );
  return bulletins.length;
};

const bulkUnpublishBulletins = async (classId, periodId) => {
  const result = await Bulletin.updateMany(
    { class: classId, period: periodId, isPublished: true },
    { isPublished: false, $unset: { publishedAt: 1 } },
  );
  return result.modifiedCount;
};

const getBulletinsByClass = async (classId, periodId) =>
  Bulletin.find({ class: classId, period: periodId })
    .populate("student", "firstName lastName")
    .populate("averages.subject", "name code")
    .sort({ rank: 1, generalAverage: -1 })
    .lean();

const getPublishedByParent = async (parentId, periodId = null) => {
  const childrenIds = await Student.find({ parents: parentId }).distinct("_id");
  const query = { student: { $in: childrenIds }, isPublished: true };
  if (periodId) query.period = periodId;
  return Bulletin.find(query)
    .populate("student", "firstName lastName")
    .populate("class", "name level")
    .populate("period", "name type year startDate endDate")
    .populate("averages.subject", "name code")
    .sort({ generalAverage: -1 })
    .lean();
};

const getAllBulletins = async (periodId, classId) => {
  const query = {};
  if (periodId && periodId !== "all") query.period = periodId;
  if (classId && classId !== "all") query.class = classId;
  const bulletins = await Bulletin.find(query)
    .populate("student", "firstName lastName matricule photo")
    .populate("class", "name level")
    .populate("period", "name type year isActive")
    .sort({ rank: 1, generalAverage: -1 })
    .lean();
  return bulletins.filter((b) => b.student);
};

/** Clé de vérification des QR codes ; à fixer via BULLETIN_VERIFY_SECRET pour survivre à une rotation du JWT_SECRET. */
const verificationSecret = () =>
  process.env.BULLETIN_VERIFY_SECRET ||
  crypto.createHmac("sha256", process.env.JWT_SECRET || "").update("bulletin-verification").digest("hex");

/** Code infalsifiable lié au bulletin et à sa moyenne : un recalcul invalide l'ancien QR code. */
const verificationCode = (bulletin) =>
  crypto
    .createHmac("sha256", verificationSecret())
    .update(`${idOf(bulletin._id)}:${idOf(bulletin.student)}:${idOf(bulletin.period)}:${bulletin.generalAverage ?? "NC"}`)
    .digest("hex")
    .slice(0, 24);

const verifyBulletin = async (bulletinId, code) => {
  if (!mongoose.isValidObjectId(bulletinId) || typeof code !== "string" || !/^[a-f0-9]{24}$/.test(code)) {
    return { valid: false };
  }
  const bulletin = await Bulletin.findById(bulletinId)
    .populate("student", "firstName lastName matricule")
    .populate("class", "name")
    .populate("period", "name type year")
    .lean();
  if (!bulletin || !bulletin.isPublished) return { valid: false };
  const expected = verificationCode(bulletin);
  if (!crypto.timingSafeEqual(Buffer.from(code), Buffer.from(expected))) return { valid: false };
  return {
    valid: true,
    studentName: bulletin.student ? `${bulletin.student.lastName} ${bulletin.student.firstName}` : null,
    matricule: bulletin.student?.matricule || null,
    className: bulletin.class?.name || null,
    periodName: bulletin.period?.name || null,
    periodType: bulletin.period?.type || null,
    year: bulletin.period?.year || null,
    generalAverage: bulletin.generalAverage ?? null,
    rank: bulletin.rank ?? null,
    classifiedCount: bulletin.classifiedCount ?? null,
    publishedAt: bulletin.publishedAt || bulletin.updatedAt,
  };
};

const getBulletinById = async (bulletinId) => {
  if (!mongoose.isValidObjectId(bulletinId)) return null;
  const bulletin = await Bulletin.findById(bulletinId)
    .populate({
      path: "student",
      select: "firstName lastName matricule matriculeMinesec photo dateOfBirth placeOfBirth gender isRepeating parents",
      populate: { path: "parents", select: "firstName lastName phone" },
    })
    .populate({
      path: "class",
      select: "name level principalTeacher",
      populate: { path: "principalTeacher", select: "firstName lastName" },
    })
    .populate("period", "name type year isActive isClosed parentPeriod startDate endDate")
    .populate("averages.subject", "name code")
    .lean();
  if (!bulletin) return null;

  const classId = idOf(bulletin.class);
  const periodId = idOf(bulletin.period);

  // Anciens bulletins trimestriels (sans notes de séquence figées) : on lit les bulletins de séquence.
  const hasStoredSequenceMarks = (bulletin.averages || []).some((a) => a.sequenceMarks?.length);
  if (bulletin.period?.type === "TRIMESTRE" && !hasStoredSequenceMarks) {
    const childSequences = await Period.find({ parentPeriod: bulletin.period._id, type: "SEQUENCE" })
      .select("_id name")
      .lean();
    if (childSequences.length) {
      bulletin.childBulletins = await Bulletin.find({
        student: bulletin.student?._id,
        period: { $in: childSequences.map((s) => s._id) },
      })
        .populate("period", "name")
        .lean();
    }
  }

  const classBulletins = await Bulletin.find({ class: classId, period: periodId })
    .select("student generalAverage averages")
    .lean();

  const general = calc.summarize(classBulletins.map((b) => b.generalAverage));
  bulletin.classProfile = {
    maxAverage: general.max ?? 0,
    minAverage: general.min ?? 0,
    classAverage: general.average ?? 0,
    totalStudents: classBulletins.length,
    classifiedCount: general.count,
    admittedCount: general.above10,
    successRate: general.count ? calc.round2((general.above10 / general.count) * 100) : 0,
  };

  // Enseignant de chaque matière : affectation de la classe, sinon auteur d'une évaluation.
  const teacherMap = {};
  const evaluations = await Evaluation.find({ class: classId })
    .select("subject teacher")
    .populate("teacher", "firstName lastName")
    .lean();
  for (const ev of evaluations) {
    if (ev.subject && ev.teacher) teacherMap[idOf(ev.subject)] = `${ev.teacher.lastName} ${ev.teacher.firstName}`;
  }
  const assignments = await TeacherAssignment.find({ classId, isActive: true })
    .populate("teacherId", "firstName lastName")
    .lean();
  for (const a of assignments) {
    if (a.teacherId) teacherMap[idOf(a.subjectId)] = `${a.teacherId.lastName} ${a.teacherId.firstName}`;
  }

  const curStudentId = idOf(bulletin.student);
  bulletin.averages = (bulletin.averages || []).map((a) => {
    const sid = idOf(a.subject);
    const values = classBulletins.map((cb) => ({
      key: idOf(cb.student),
      value: (cb.averages || []).find((x) => idOf(x.subject) === sid)?.average ?? null,
    }));
    const stats = calc.summarize(values.map((v) => v.value));
    const rank = a.rank ?? calc.rankWithTies(values).get(curStudentId) ?? null;
    return {
      ...a,
      min: stats.min,
      max: stats.max,
      classAverage: stats.average,
      rank,
      teacherName: teacherMap[sid] || "Non assigné",
    };
  });

  if (bulletin.isPublished) bulletin.verificationCode = verificationCode(bulletin);
  return bulletin;
};

/**
 * Appréciation et décisions du conseil. Réservé au secrétariat, à l'administration et au
 * professeur principal ; impossible sur un bulletin publié.
 */
const updateDetails = async (bulletinId, { teacherComment, decisions }, user) => {
  assertObjectId(bulletinId, "Identifiant de bulletin");
  const bulletin = await Bulletin.findById(bulletinId);
  if (!bulletin) throw httpError(404, "Bulletin introuvable.");

  if (user.role === "teacher") {
    const { isPrincipalTeacher } = require("../../utils/access");
    if (!(await isPrincipalTeacher(user.id, bulletin.class))) {
      throw httpError(403, "Seul le professeur principal peut modifier ce bulletin.");
    }
  }
  if (bulletin.isPublished) {
    throw httpError(409, "Ce bulletin est publié : dépubliez-le avant de le modifier.");
  }

  if (teacherComment !== undefined) {
    if (typeof teacherComment !== "string") throw httpError(400, "Appréciation invalide.");
    if (teacherComment.length > 1000) throw httpError(400, "Appréciation trop longue (1000 caractères maximum).");
    bulletin.teacherComment = teacherComment.trim();
  }
  if (decisions !== undefined) {
    if (!Array.isArray(decisions) || decisions.some((d) => !DECISION_CODES.includes(d))) {
      throw httpError(400, "Décisions invalides.");
    }
    bulletin.decisions = [...new Set(decisions)];
  }
  await bulletin.save();
  return bulletin;
};

module.exports = {
  DECISION_CODES,
  generateForClass,
  calculateBulletin,
  computeStudentAverages,
  computeClassStandings,
  publishBulletin,
  unpublishBulletin,
  bulkPublishBulletins,
  bulkUnpublishBulletins,
  getBulletinsByClass,
  getPublishedByParent,
  getAllBulletins,
  getBulletinById,
  updateDetails,
  verifyBulletin,
  verificationCode,
};
