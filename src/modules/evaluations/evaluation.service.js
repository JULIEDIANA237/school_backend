const Evaluation = require("./evaluation.model");
const Grade = require("../grades/grade.model");
const Period = require("../periods/period.model");
const { isTeacherAssigned } = require("../teachers/teacherAssignment.service");

/**
 * Création d'une évaluation
 * Règle : seul un enseignant affecté à la classe + matière peut créer
 */
const createEvaluation = async (data) => {
  const { teacher, class: classId, subject } = data;

  if (!(await isTeacherAssigned(teacher, classId, subject))) {
    throw new Error("Teacher not assigned to this class/subject");
  }

  const evaluation = new Evaluation(data);
  await evaluation.save();
  return evaluation;
};

/**
 * Récupération des évaluations par classe (+ période optionnelle)
 */
// evaluation.service.js
const getEvaluationsByClass = async (classId, periodId) => {
  console.log("🧠 SERVICE getEvaluationsByClass");
  console.log("➡️ classId reçu =", classId);
  console.log("➡️ periodId reçu =", periodId);

  if (!classId) {
    console.error("⛔ classId MANQUANT");
    throw new Error("classId is required");
  }

  const query = { class: classId };

  if (periodId) {
    query.period = periodId;
  } else {
    const activePeriod = await Period.findOne({ isClosed: false }).sort({
      startDate: -1,
    });

    if (activePeriod) {
      query.period = activePeriod._id;
      console.log("🟢 Période active utilisée =", activePeriod.name);
    } else {
      console.warn("⚠️ Aucune période active trouvée — toutes périodes");
    }}

  console.log("📦 Mongo query =", query);

  const evaluations = await Evaluation.find(query)
    .populate("subject", "name")
    .populate("teacher", "firstName lastName")
    .populate("period", "name isClosed")
    .populate("class", "name level")
    .sort({ createdAt: -1 });

  console.log("✅ Evaluations trouvées =", evaluations.length);

  return evaluations;
};



/**
 * Ajout d'une note
 * Règles métier :
 * 1. Le prof ne note que SES évaluations
 * 2. Impossible de noter deux fois le même élève
 * 3. Impossible de noter si la période est clôturée
 */
const addGrade = async (evaluationId, teacherId, studentId, score, comment) => {
  const evaluation = await Evaluation.findById(evaluationId).populate("period");

  if (!evaluation) {
    throw new Error("Evaluation not found");
  }

  // 🔐 Sécurité : un prof ne note que ses évaluations
  if (evaluation.teacher.toString() !== teacherId.toString()) {
    throw new Error("Teacher not allowed to grade this evaluation");
  }

  // 🔒 Sécurité : période clôturée = aucune modification autorisée
  if (evaluation.period.isClosed) {
    throw new Error("Period is closed. Grades are locked.");
  }

  // ❌ Règle métier : un élève ne peut avoir qu'une seule note par évaluation
  const existingGrade = await Grade.findOne({
    evaluation: evaluationId,
    student: studentId
  });

  if (existingGrade) {
    throw new Error("Student already graded for this evaluation");
  }

  const grade = new Grade({
    evaluation: evaluationId,
    student: studentId,
    score,
    comment
  });

  await grade.save();
  return grade;
};

/**
 * Modification d'une note
 * Règle : interdite si la période est clôturée
 */
const updateGrade = async (gradeId, teacherId, newScore, newComment) => {
  const grade = await Grade.findById(gradeId).populate({
    path: "evaluation",
    populate: { path: "period" }
  });

  if (!grade) {
    throw new Error("Grade not found");
  }

  // 🔐 Vérifie que le prof est bien le créateur de l’évaluation
  if (grade.evaluation.teacher.toString() !== teacherId.toString()) {
    throw new Error("Teacher not allowed to modify this grade");
  }

  // 🔒 Blocage total après clôture de période
  if (grade.evaluation.period.isClosed) {
    throw new Error("Period is closed. Grade modification forbidden.");
  }

  grade.score = newScore;
  grade.comment = newComment;
  await grade.save();

  return grade;
};

const publishEvaluation = async (evaluationId) => {
  const evaluation = await Evaluation.findById(evaluationId);
  if (!evaluation) throw new Error("Evaluation not found");

  evaluation.isPublished = true;
  await evaluation.save();
  return evaluation;
};

const getGradesForEvaluation = async (evaluationId) => {
  return Grade.find({ evaluation: evaluationId })
    .populate("student", "firstName lastName");
};

module.exports = {
  createEvaluation,
  addGrade,
  updateGrade,
  publishEvaluation,
  getGradesForEvaluation,
  getEvaluationsByClass
};
