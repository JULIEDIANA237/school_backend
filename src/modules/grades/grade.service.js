const Grade = require("./grade.model");
const Evaluation = require("../evaluations/evaluation.model");
const Student = require("../students/student.model");

// Créer ou mettre à jour une note
const upsertGrade = async ({ studentId, evaluationId, score }) => {
  // Vérifications métier
  const student = await Student.findById(studentId);
  if (!student) throw new Error("Student not found");

  const evaluation = await Evaluation.findById(evaluationId);
  if (!evaluation) throw new Error("Evaluation not found");

  if (score < 0 || score > evaluation.maxScore) {
    throw new Error("Invalid score");
  }

  const grade = await Grade.findOneAndUpdate(
    { student: studentId, evaluation: evaluationId },
    { score },
    { new: true, upsert: true }
  );

  return grade;
};

// Récupérer les notes d'un élève pour une période
const getGradesByStudent = async (studentId, periodId) => {
  const grades = await Grade.find({ student: studentId })
    .populate({
      path: "evaluation",
      match: { period: periodId },
      populate: { path: "subject", select: "name code" }
    })
    .lean();

  return grades.filter(g => g.evaluation); // supprimer les null
};

/**
 * Suppression d'une note
 * Règles métier :
 * - Interdite si la période est clôturée
 * - Seul le prof de l’évaluation peut supprimer
 */
const deleteGrade = async (gradeId, teacherId) => {
  const grade = await Grade.findById(gradeId).populate({
    path: "evaluation",
    populate: { path: "period" }
  });

  if (!grade) {
    throw new Error("Grade not found");
  }

  // 🔐 Autorité pédagogique
  if (grade.evaluation.teacher.toString() !== teacherId.toString()) {
    throw new Error("Teacher not allowed to delete this grade");
  }

  // 🔒 Période clôturée = données figées
  if (grade.evaluation.period.isClosed) {
    throw new Error("Period is closed. Grade deletion forbidden.");
  }

  await grade.deleteOne();
  return true;
};

module.exports = {
  upsertGrade,
  getGradesByStudent,
  deleteGrade
};
