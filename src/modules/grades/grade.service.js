const mongoose = require("mongoose");
const Grade = require("./grade.model");
const Evaluation = require("../evaluations/evaluation.model");
const Student = require("../students/student.model");
const Period = require("../periods/period.model");
const BulletinService = require("../bulletins/bulletin.service");
const calc = require("../bulletins/bulletin.calculator");
const { assertPeriodOpen } = require("../periods/period.service");
const {
  isTeacherOfClass,
  isPrincipalTeacher,
  assertClassAccess,
  assertStudentAccess,
} = require("../../utils/access");
const { httpError } = require("../../utils/httpError");

const idOf = (value) => String(value?._id ?? value);

/**
 * Convertit une note en appréciation (barème ramené sur 20)
 */
function getAppreciation(score, maxScore = 20) {
  const normalized = (score / maxScore) * 20;
  if (normalized >= 16) return "Expert";
  if (normalized >= 14) return "Acquis";
  if (normalized >= 10) return "En cours d'acquisition";
  return "Non acquis";
}

const assertObjectId = (value, label) => {
  if (!mongoose.isValidObjectId(value)) throw httpError(400, `${label} invalide.`);
};

/** Une séquence, ou un trimestre et ses séquences. */
const periodIdsFor = async (periodId) => {
  assertObjectId(periodId, "Identifiant de période");
  const period = await Period.findById(periodId).select("type").lean();
  if (!period) throw httpError(404, "Période introuvable.");
  if (period.type !== "TRIMESTRE") return [period._id];
  const children = await Period.find({ parentPeriod: periodId }).select("_id").lean();
  return [period._id, ...children.map((c) => c._id)];
};

/** Un enseignant non principal ne voit que ses propres évaluations dans une classe. */
const teacherEvaluationFilter = async (user, classId) => {
  if (user.role !== "teacher") return {};
  return (await isPrincipalTeacher(user.id, classId)) ? {} : { teacher: user.id };
};

const parseScore = (score, maxScore) => {
  const value =
    typeof score === "number" ? score : typeof score === "string" && score.trim() !== "" ? Number(score.replace(",", ".")) : NaN;
  if (!Number.isFinite(value) || value < 0 || value > maxScore) {
    throw httpError(400, `Note invalide : elle doit être comprise entre 0 et ${maxScore}.`);
  }
  return Math.round(value * 100) / 100;
};

/**
 * Crée ou met à jour une note.
 * - Enseignant : uniquement ses évaluations, et seulement s'il est toujours affecté à la classe/matière.
 * - Période (ou trimestre parent) clôturée : refus.
 * - L'élève doit être inscrit et actif dans la classe de l'évaluation.
 */
const upsertGrade = async ({ studentId, evaluationId, score, comment, user }) => {
  assertObjectId(studentId, "Identifiant d'élève");
  assertObjectId(evaluationId, "Identifiant d'évaluation");

  const evaluation = await Evaluation.findById(evaluationId).populate("period", "isClosed parentPeriod").lean();
  if (!evaluation) throw httpError(404, "Évaluation introuvable.");

  if (user.role === "teacher") {
    if (idOf(evaluation.teacher) !== user.id) {
      throw httpError(403, "Vous ne pouvez noter que vos propres évaluations.");
    }
    if (!(await isTeacherOfClass(user.id, evaluation.class, { subjectId: evaluation.subject }))) {
      throw httpError(403, "Vous n'êtes plus affecté à cette classe pour cette matière.");
    }
  }
  await assertPeriodOpen(evaluation.period);

  const student = await Student.findById(studentId).select("class isActive").lean();
  if (!student) throw httpError(404, "Élève introuvable.");
  if (idOf(student.class) !== idOf(evaluation.class) || !student.isActive) {
    throw httpError(400, "L'élève n'appartient pas à la classe de cette évaluation.");
  }

  const value = parseScore(score, evaluation.maxScore);
  const finalComment =
    typeof comment === "string" && comment.trim() ? comment.trim().slice(0, 300) : getAppreciation(value, evaluation.maxScore);

  return Grade.findOneAndUpdate(
    { student: studentId, evaluation: evaluationId },
    { $set: { score: value, comment: finalComment } },
    { returnDocument: "after", upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
};

const getGradesByStudent = async (studentId, periodId, user) => {
  const student = await assertStudentAccess(user, studentId);
  const periodIds = await periodIdsFor(periodId);
  const evaluationFilter = await teacherEvaluationFilter(user, student.class);
  const grades = await Grade.find({ student: studentId })
    .populate({
      path: "evaluation",
      match: { period: { $in: periodIds }, ...evaluationFilter },
      populate: { path: "subject", select: "name code" },
    })
    .lean();
  return grades.filter((g) => g.evaluation);
};

const deleteGrade = async (gradeId, user) => {
  assertObjectId(gradeId, "Identifiant de note");
  const grade = await Grade.findById(gradeId).populate({
    path: "evaluation",
    populate: { path: "period", select: "isClosed parentPeriod" },
  });
  if (!grade) throw httpError(404, "Note introuvable.");

  if (!grade.evaluation) {
    // Note orpheline (évaluation supprimée) : seule l'administration peut la retirer
    if (user.role !== "admin") throw httpError(403, "Suppression non autorisée.");
  } else {
    if (user.role === "teacher" && idOf(grade.evaluation.teacher) !== user.id) {
      throw httpError(403, "Vous ne pouvez supprimer que les notes de vos évaluations.");
    }
    await assertPeriodOpen(grade.evaluation.period);
  }

  await grade.deleteOne();
  return true;
};

/** Moyennes d'un élève, calculées à la volée (aucun bulletin n'est créé ni modifié). */
const getStudentAverages = async (studentId, classId, periodId, user) => {
  const student = await assertStudentAccess(user, studentId);
  if (idOf(student.class) !== idOf(classId)) {
    throw httpError(400, "L'élève n'est pas inscrit dans cette classe.");
  }
  const result = await BulletinService.computeStudentAverages(studentId, periodId);
  return {
    studentId: result.studentId,
    generalAverage: result.generalAverage,
    averages: result.averages.map((a) => ({ subject: a.subject, average: a.average, coefficient: a.coefficient })),
  };
};

/** Statistiques et classement d'une classe, calculés à la volée. */
const getClassAverages = async (classId, periodId, user) => {
  await assertClassAccess(user, classId);
  const { classDoc, entries } = await BulletinService.computeClassStandings(classId, periodId);
  const values = entries.map((e) => e.generalAverage).filter((v) => v !== null).sort((a, b) => a - b);
  const stats = calc.summarize(values);
  const mid = Math.floor(values.length / 2);
  const median = values.length
    ? values.length % 2
      ? values[mid]
      : calc.round2((values[mid - 1] + values[mid]) / 2)
    : 0;

  return {
    classId,
    className: classDoc.name,
    periodId,
    classAverage: stats.average ?? 0,
    highest: stats.max ?? 0,
    lowest: stats.min ?? 0,
    median,
    studentsAbove10: stats.above10,
    studentsBelow10: stats.count - stats.above10,
    unclassified: entries.length - stats.count,
    students: entries
      .map((e) => ({ studentId: e.key, studentName: e.studentName, average: e.generalAverage, rank: e.rank }))
      .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity)),
  };
};

/** Moyennes d'une matière pour toute une classe (vue enseignant). */
const getSubjectAveragesForClass = async (classId, subjectId, periodId, user) => {
  assertObjectId(classId, "Identifiant de classe");
  assertObjectId(subjectId, "Identifiant de matière");
  if (
    user.role === "teacher" &&
    !(await isTeacherOfClass(user.id, classId, { subjectId })) &&
    !(await isPrincipalTeacher(user.id, classId))
  ) {
    throw httpError(403, "Accès interdit à cette matière pour cette classe.");
  }

  const students = await Student.find({ class: classId, isActive: true })
    .select("firstName lastName matricule photo")
    .sort({ lastName: 1, firstName: 1 })
    .lean();
  if (!students.length) return { classSubjectAverage: 0, studentAverages: [] };

  const evaluations = await Evaluation.find({
    class: classId,
    subject: subjectId,
    period: { $in: await periodIdsFor(periodId) },
  }).lean();

  const grades = evaluations.length
    ? await Grade.find({
        student: { $in: students.map((s) => s._id) },
        evaluation: { $in: evaluations.map((e) => e._id) },
      }).lean()
    : [];

  const studentAverages = students.map((student) => {
    const own = grades.filter((g) => idOf(g.student) === idOf(student._id));
    const scores = new Map(own.map((g) => [idOf(g.evaluation), g.score]));
    return {
      student,
      average: calc.computeSubjectAverage(evaluations, scores),
      totalEvaluations: own.length,
    };
  });

  const classSubjectAverage = calc.summarize(studentAverages.map((s) => s.average)).average ?? 0;
  return { classSubjectAverage, studentAverages };
};

/**
 * Élèves, évaluations et notes d'une classe pour la grille de saisie.
 * Un enseignant non principal ne reçoit que ses propres évaluations.
 */
const getGradesByClass = async (classId, { periodId, subjectId } = {}, user) => {
  await assertClassAccess(user, classId);
  const students = await Student.find({ class: classId, isActive: true })
    .select("firstName lastName matricule photo")
    .sort({ lastName: 1, firstName: 1 })
    .lean();

  const evalQuery = { class: classId, ...(await teacherEvaluationFilter(user, classId)) };
  if (periodId) evalQuery.period = { $in: await periodIdsFor(periodId) };
  if (subjectId) {
    assertObjectId(subjectId, "Identifiant de matière");
    evalQuery.subject = subjectId;
  }

  const evaluations = await Evaluation.find(evalQuery)
    .populate("subject", "name")
    .populate("period", "name")
    .sort({ date: 1 })
    .lean();

  const grades = await Grade.find({
    evaluation: { $in: evaluations.map((e) => e._id) },
    student: { $in: students.map((s) => s._id) },
  }).lean();

  return {
    students,
    evaluations: evaluations.map((e) => ({
      id: e._id,
      name: e.name,
      subject: e.subject?.name,
      maxScore: e.maxScore,
      coefficient: e.coefficient,
      date: e.date,
      isPublished: e.isPublished,
    })),
    grades: grades.map((g) => ({
      studentId: g.student,
      evaluationId: g.evaluation,
      score: g.score,
      comment: g.comment,
    })),
  };
};

module.exports = {
  getAppreciation,
  upsertGrade,
  getGradesByStudent,
  deleteGrade,
  getStudentAverages,
  getClassAverages,
  getSubjectAveragesForClass,
  getGradesByClass,
};
