const mongoose = require("mongoose");
const Evaluation = require("./evaluation.model");
const Grade = require("../grades/grade.model");
const Period = require("../periods/period.model");
const ClassModel = require("../classes/class.model");
const Student = require("../students/student.model");
const { formatSchoolDate } = require("../../utils/school");
const { waitUntil } = require("@vercel/functions");
const notificationService = require("../notifications/notification.service");
const { assertPeriodOpen, findActivePeriod } = require("../periods/period.service");
const { isTeacherOfClass, assertClassAccess } = require("../../utils/access");
const { httpError } = require("../../utils/httpError");

const idOf = (value) => String(value?._id ?? value);

const assertObjectId = (value, label) => {
  if (!mongoose.isValidObjectId(value)) throw httpError(400, `${label} invalide.`);
};

const countGrades = (evaluationId) => Grade.countDocuments({ evaluation: evaluationId });

const parseNumber = (value, label, { min, max, fallback }) => {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= min || n > max) throw httpError(400, `${label} invalide (entre ${min} exclu et ${max}).`);
  return n;
};

const parseDate = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const date = new Date(value);
  if (isNaN(date.getTime())) throw httpError(400, "Date invalide.");
  return date;
};

const notify = (data) =>
  notificationService.createNotification(data).catch((err) => console.error("[NOTIFICATION_FAILURE]", err.message));

/** Nombre lisible : 12, 12.5, 13.33 */
const formatScore = (value) => String(Math.round(value * 100) / 100);

/**
 * Une notification par enfant à chacun de ses parents (élèves actifs de la classe), pour suivre
 * l'évolution de l'élève au fil de l'année sans attendre le bulletin. `build` renvoie null pour ignorer un élève.
 * Un échec n'empêche jamais l'action de l'enseignant.
 */
const notifyParentsOfClass = async (classId, build) => {
  try {
    const students = await Student.find({ class: classId, isActive: true })
      .select("firstName parents")
      .populate("parents", "email firstName settings.notifications.email")
      .lean();
    const notifications = [];
    const emails = [];
    for (const student of students) {
      const content = build(student);
      if (!content) continue;
      for (const parent of (student.parents || []).filter(Boolean)) {
        notifications.push({ user: parent._id, type: "INFO", link: "/parent", ...content });
        if (parent.email && parent.settings?.notifications?.email !== false) emails.push({ parent, content });
      }
    }
    await notificationService.createMany(notifications);
    // Emails après la réponse : l'enseignant n'attend pas l'envoi (waitUntil garde la fonction Vercel active)
    if (emails.length && process.env.PARENT_EMAILS !== "false") {
      waitUntil(notificationService.sendParentEmails(emails));
    }
  } catch (err) {
    console.error("[PARENT_NOTIFICATION_FAILURE]", err.message);
  }
};

/**
 * Notes envoyées aux parents à la publication. Une republication n'envoie que les notes
 * saisies ou corrigées depuis le dernier envoi.
 */
const notifyParentsOfGrades = async (evaluation, dto) => {
  const since = evaluation.parentsNotifiedAt ? new Date(evaluation.parentsNotifiedAt) : null;
  const grades = await Grade.find({ evaluation: evaluation._id }).select("student score createdAt updatedAt").lean();
  if (!grades.length) return;
  const average = grades.reduce((sum, g) => sum + g.score, 0) / grades.length;
  const byStudent = new Map(grades.map((g) => [idOf(g.student), g]));

  await notifyParentsOfClass(dto.classId, (student) => {
    const grade = byStudent.get(idOf(student._id));
    if (!grade) return null;
    const isNew = !since || new Date(grade.createdAt) > since;
    const isCorrected = !isNew && new Date(grade.updatedAt) > since;
    if (!isNew && !isCorrected) return null;
    return {
      title: `${isCorrected ? "Note corrigée" : "Note publiée"} : ${dto.subject}`,
      message:
        `${student.firstName} a obtenu ${formatScore(grade.score)}/${dto.maxScore} à « ${dto.title} » ` +
        `(${dto.subject}, ${dto.className}, ${dto.period}). Moyenne de la classe : ${formatScore(average)}/${dto.maxScore}.`,
    };
  });
  await Evaluation.updateOne({ _id: evaluation._id }, { $set: { parentsNotifiedAt: new Date() } });
};

/** « Devoir 1 » (Mathématiques, 6e A, Séquence 1) : l'enseignant sait de quelle classe il s'agit. */
const describeEvaluation = (dto) => {
  const context = [dto.subject, dto.className, dto.period].filter(Boolean).join(", ");
  return `« ${dto.title} »${context ? ` (${context})` : ""}`;
};

/** DTO attendu par l'interface enseignant. */
const toDTO = async (evaluationId) => {
  const e = await Evaluation.findById(evaluationId)
    .populate("period", "name")
    .populate("subject", "name")
    .populate("class", "name")
    .lean();
  return {
    id: idOf(e._id),
    title: e.name,
    classId: e.class ? idOf(e.class) : null,
    className: e.class?.name,
    subjectId: e.subject ? idOf(e.subject) : null,
    subject: e.subject?.name,
    periodId: e.period ? idOf(e.period) : null,
    period: e.period?.name,
    date: e.date,
    maxScore: e.maxScore,
    coefficient: e.coefficient,
    isPublished: e.isPublished,
    gradesCount: await countGrades(e._id),
  };
};

/**
 * Vérifie qu'une évaluation peut viser cette classe / matière / séquence :
 * séquence (pas trimestre) de l'année scolaire de la classe, non clôturée,
 * et enseignant affecté à la classe pour la matière.
 */
const validateTarget = async ({ classId, subjectId, periodId, teacherId }) => {
  assertObjectId(classId, "Identifiant de classe");
  assertObjectId(subjectId, "Identifiant de matière");
  assertObjectId(periodId, "Identifiant de période");

  const [classDoc, period] = await Promise.all([
    ClassModel.findById(classId).populate("schoolYearId", "name").lean(),
    Period.findById(periodId).lean(),
  ]);
  if (!classDoc) throw httpError(404, "Classe introuvable.");
  if (!period) throw httpError(404, "Période introuvable.");
  if (period.type !== "SEQUENCE") {
    throw httpError(400, "Une évaluation doit être rattachée à une séquence (pas à un trimestre).");
  }
  if (classDoc.schoolYearId?.name && period.year !== classDoc.schoolYearId.name) {
    throw httpError(400, "Cette séquence n'appartient pas à l'année scolaire de la classe.");
  }
  await assertPeriodOpen(period);
  if (!(await isTeacherOfClass(teacherId, classId, { subjectId }))) {
    throw httpError(403, "Vous n'êtes pas affecté à cette classe pour cette matière.");
  }
};

const loadOwned = async (evaluationId, teacherId, action) => {
  assertObjectId(evaluationId, "Identifiant d'évaluation");
  const evaluation = await Evaluation.findById(evaluationId).populate("period", "isClosed parentPeriod");
  if (!evaluation) throw httpError(404, "Évaluation introuvable.");
  if (idOf(evaluation.teacher) !== idOf(teacherId)) {
    throw httpError(403, `Vous ne pouvez pas ${action} une évaluation créée par un autre enseignant.`);
  }
  return evaluation;
};

/**
 * Création (enseignant). Seuls les champs connus sont pris en compte : le statut
 * de publication et l'auteur ne viennent jamais du corps de la requête.
 */
const createEvaluation = async (body, teacherId) => {
  const name = String(body.name ?? body.title ?? "").trim();
  if (!name) throw httpError(400, "Le titre de l'évaluation est requis.");
  if (name.length > 150) throw httpError(400, "Titre trop long (150 caractères maximum).");

  const classId = body.class ?? body.classId;
  const subjectId = body.subject ?? body.subjectId;
  const periodId = body.period ?? body.periodId;
  await validateTarget({ classId, subjectId, periodId, teacherId });

  const evaluation = await Evaluation.create({
    name,
    class: classId,
    subject: subjectId,
    period: periodId,
    teacher: teacherId,
    maxScore: parseNumber(body.maxScore, "Barème", { min: 0, max: 100, fallback: 20 }),
    coefficient: parseNumber(body.coefficient, "Coefficient", { min: 0, max: 10, fallback: 1 }),
    date: parseDate(body.date) ?? new Date(),
    isPublished: false,
  });

  const dto = await toDTO(evaluation._id);
  await notify({
    user: teacherId,
    title: dto.className ? `Évaluation créée en ${dto.className}` : "Évaluation créée",
    message: `L'évaluation ${describeEvaluation(dto)} a été créée. Saisissez les notes puis publiez-la.`,
    type: "SUCCESS",
    link: `/teacher/grades?class=${dto.classId}&subject=${dto.subjectId}`,
  });
  await notifyParentsOfClass(dto.classId, (student) => ({
    title: `Nouvelle évaluation : ${dto.subject}`,
    message: `${student.firstName} (${dto.className}) : nouvelle évaluation « ${dto.title} » en ${dto.subject}, ${dto.period}, du ${formatSchoolDate(dto.date)}.`,
  }));
  return dto;
};

/**
 * Modification par l'enseignant auteur, tant que l'évaluation n'est pas publiée
 * et que sa période n'est pas clôturée.
 */
const updateEvaluation = async (evaluationId, teacherId, updates = {}) => {
  const evaluation = await loadOwned(evaluationId, teacherId, "modifier");
  if (evaluation.isPublished) throw httpError(409, "Dépubliez l'évaluation avant de la modifier.");
  await assertPeriodOpen(evaluation.period);

  const name = updates.name ?? updates.title;
  const subjectId = updates.subject ?? updates.subjectId;
  const periodId = updates.period ?? updates.periodId;

  if (name !== undefined && name !== null && name !== "") {
    const trimmed = String(name).trim();
    if (!trimmed || trimmed.length > 150) throw httpError(400, "Titre invalide.");
    evaluation.name = trimmed;
  }
  const date = parseDate(updates.date);
  if (date) evaluation.date = date;
  if (updates.coefficient !== undefined && updates.coefficient !== "") {
    evaluation.coefficient = parseNumber(updates.coefficient, "Coefficient", { min: 0, max: 10, fallback: evaluation.coefficient });
  }
  if (updates.maxScore !== undefined && updates.maxScore !== "") {
    const maxScore = parseNumber(updates.maxScore, "Barème", { min: 0, max: 100, fallback: evaluation.maxScore });
    const highest = await Grade.findOne({ evaluation: evaluation._id }).sort({ score: -1 }).select("score").lean();
    if (highest && highest.score > maxScore) {
      throw httpError(400, `Une note déjà saisie (${highest.score}) dépasse le nouveau barème.`);
    }
    evaluation.maxScore = maxScore;
  }

  const newSubject = subjectId && idOf(subjectId) !== idOf(evaluation.subject) ? subjectId : null;
  const newPeriod = periodId && idOf(periodId) !== idOf(evaluation.period) ? periodId : null;
  if (newSubject || newPeriod) {
    await validateTarget({
      classId: evaluation.class,
      subjectId: newSubject || evaluation.subject,
      periodId: newPeriod || idOf(evaluation.period),
      teacherId,
    });
    if (newSubject) evaluation.subject = newSubject;
    if (newPeriod) evaluation.period = newPeriod;
  }

  await evaluation.save();
  return toDTO(evaluation._id);
};

/**
 * Évaluations d'une classe (+ période optionnelle ; un trimestre inclut ses séquences).
 * Un enseignant ne voit que les siennes.
 */
const getEvaluationsByClass = async (classId, periodId, user) => {
  await assertClassAccess(user, classId);
  const query = { class: classId };
  if (user.role === "teacher") query.teacher = user.id;
  const period = await periodCondition(periodId);
  if (period) query.period = period;
  return listEvaluations(query);
};

/**
 * Évaluations d'un enseignant sur la période active, toutes classes confondues (tableau de bord).
 * Une seule série de requêtes au lieu d'un appel par classe.
 */
const getTeacherEvaluations = async (teacherId) => {
  const query = { teacher: teacherId };
  const period = await periodCondition();
  if (period) query.period = period;
  return listEvaluations(query);
};

/** Condition sur la période demandée (un trimestre inclut ses séquences), sinon sur la période active. */
const periodCondition = async (periodId) => {
  const period = periodId ? await Period.findById(periodId).lean() : await findActivePeriod();
  if (periodId && !period) throw httpError(404, "Période introuvable.");
  if (!period) return undefined;
  if (period.type !== "TRIMESTRE") return period._id;
  const childSequences = await Period.find({ parentPeriod: period._id }).select("_id").lean();
  return { $in: [period._id, ...childSequences.map((s) => s._id)] };
};

/** Évaluations détaillées, avec le nombre de notes saisies. */
const listEvaluations = async (query) => {
  const evaluations = await Evaluation.find(query)
    .populate("subject", "name")
    .populate("teacher", "firstName lastName")
    .populate("period", "name isActive isClosed")
    .populate("class", "name level")
    .sort({ createdAt: -1 })
    .lean();

  const gradeCounts = await Grade.aggregate([
    { $match: { evaluation: { $in: evaluations.map((e) => e._id) } } },
    { $group: { _id: "$evaluation", count: { $sum: 1 } } },
  ]);
  const countMap = new Map(gradeCounts.map((c) => [idOf(c._id), c.count]));

  return evaluations.map((e) => ({ ...e, id: e._id, gradesCount: countMap.get(idOf(e._id)) || 0 }));
};

const publishEvaluation = async (evaluationId, teacherId) => {
  const evaluation = await loadOwned(evaluationId, teacherId, "publier");
  await assertPeriodOpen(evaluation.period);
  evaluation.isPublished = true;
  await evaluation.save();

  const dto = await toDTO(evaluation._id);
  await notify({
    user: evaluation.teacher,
    title: dto.className ? `Évaluation publiée en ${dto.className}` : "Évaluation publiée",
    message: `L'évaluation ${describeEvaluation(dto)} est publiée et sera prise en compte dans les bulletins.`,
    type: "SUCCESS",
    link: `/teacher/grades?class=${dto.classId}&subject=${dto.subjectId}`,
  });
  await notifyParentsOfGrades(evaluation, dto).catch((err) => console.error("[PARENT_NOTIFICATION_FAILURE]", err.message));
  return dto;
};

const unpublishEvaluation = async (evaluationId, teacherId) => {
  const evaluation = await loadOwned(evaluationId, teacherId, "dépublier");
  await assertPeriodOpen(evaluation.period);
  evaluation.isPublished = false;
  await evaluation.save();
  return toDTO(evaluation._id);
};

const unpublishManyEvaluations = async (evaluationIds, teacherId) => {
  const results = { success: [], errors: [] };
  for (const id of evaluationIds) {
    try {
      await unpublishEvaluation(id, teacherId);
      results.success.push(id);
    } catch (err) {
      results.errors.push({ id, error: err.message });
    }
  }
  return results;
};

/**
 * Suppression par l'auteur : interdite si publiée ou si la période est clôturée.
 * Les notes associées sont supprimées.
 */
const deleteEvaluation = async (evaluationId, teacherId) => {
  const evaluation = await loadOwned(evaluationId, teacherId, "supprimer");
  if (evaluation.isPublished) {
    throw httpError(409, "Impossible de supprimer une évaluation publiée. Veuillez d'abord la dépublier.");
  }
  await assertPeriodOpen(evaluation.period);

  await Grade.deleteMany({ evaluation: evaluation._id });
  await Evaluation.findByIdAndDelete(evaluation._id);
  return { message: "Evaluation and associated grades deleted" };
};

module.exports = {
  createEvaluation,
  updateEvaluation,
  publishEvaluation,
  unpublishEvaluation,
  unpublishManyEvaluations,
  getEvaluationsByClass,
  getTeacherEvaluations,
  deleteEvaluation,
};
