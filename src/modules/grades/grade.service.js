const Grade = require("./grade.model");
const Evaluation = require("../evaluations/evaluation.model");
const Student = require("../students/student.model");
const BulletinService = require("../bulletins/bulletin.service"); // To re-use calculateBulletin logic for the student

/**
 * Convertit une note en appréciation sur 20
 * @param {number} score - note obtenue
 * @param {number} maxScore - note maximale possible (par défaut 20)
 * @returns {string} appréciation
 */
function getAppreciation(score, maxScore = 20) {
  const normalized = (score / maxScore) * 20; // normalisé sur 20
  if (normalized >= 16) return "Expert";
  if (normalized >= 14) return "Acquis";
  if (normalized >= 10) return "En cours d'acquisition";
  return "Non acquis";
}

/**
 * Crée ou met à jour une note avec appréciation
 * @param {Object} params
 * @param {string} params.studentId
 * @param {string} params.evaluationId
 * @param {number} params.score
 * @param {string} params.teacherId
 * @returns {Promise<Object>} grade
 */
const upsertGrade = async ({ studentId, evaluationId, score, teacherId }) => {
  // Vérifier élève
  const student = await Student.findById(studentId);
  if (!student) throw new Error("Student not found");

  // Vérifier évaluation
  const evaluation = await Evaluation.findById(evaluationId);
  if (!evaluation) throw new Error("Evaluation not found");

  // Sécurité pédagogique
  if (evaluation.teacher.toString() !== teacherId.toString()) {
    throw new Error("Teacher not allowed to grade this evaluation");
  }

  // Vérifier score
  if (score < 0 || score > evaluation.maxScore) {
    throw new Error("Invalid score");
  }

  // Calcul appréciation
  const appreciation = getAppreciation(score, evaluation.maxScore);

  // Upsert note
  const grade = await Grade.findOneAndUpdate(
    { student: studentId, evaluation: evaluationId },
    {
      score,
      comment: appreciation // <-- Correction fondamentale
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
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
 * - Seul le prof de l'évaluation peut supprimer
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

/**
 * Calculer la moyenne des notes d'un élève pour une période donnée.
 * Utilise la logique de calcul de bulletin.service.js sans sauvegarder le bulletin complet,
 * ou en le générant à la volée.
 */
const getStudentAverages = async (studentId, classId, periodId) => {
  // On peut réutiliser la même logique rigoureuse que le bulletin
  // calculateBulletin crée ou met à jour le bulletin s'il n'est pas publié.
  // Pour un simple "get", c'est acceptable car c'est idempotent.
  const bulletin = await BulletinService.calculateBulletin(studentId, classId, periodId);

  // On retourne une structure simplifiée
  return {
    studentId: bulletin.student,
    generalAverage: bulletin.generalAverage,
    averages: bulletin.averages.map(a => ({
      subject: a.subject,
      average: a.average,
      coefficient: a.coefficient
    }))
  };
};

/**
 * Calculer les moyennes de classe par matière et moyenne générale de la classe
 */
const getClassAverages = async (classId, periodId) => {
  const { calculateBulletin } = require("../bulletins/bulletin.service");
  const Class = require("../classes/class.model");

  const currentClass = await Class.findById(classId).lean();
  if (!currentClass) throw new Error("Class not found");

  // Récupérer tous les élèves de la classe
  const students = await Student.find({ class: classId, isActive: true }).lean();

  if (students.length === 0) {
    return {
      classId,
      className: currentClass.name,
      periodId,
      classAverage: 0,
      highest: 0,
      lowest: 0,
      median: 0,
      studentsAbove10: 0,
      studentsBelow10: 0,
      students: []
    };
  }

  const allBulletins = [];
  for (const student of students) {
    try {
      const b = await calculateBulletin(student._id, classId, periodId);
      allBulletins.push(b);
    } catch (err) {
      // Ignorer si l'élève n'a pas d'évaluations par ex
      console.warn(`Could not calculate average for student ${student._id}: ${err.message}`);
    }
  }

  if (allBulletins.length === 0) {
    return {
      classId,
      className: currentClass.name,
      periodId,
      classAverage: 0,
      highest: 0,
      lowest: 0,
      median: 0,
      studentsAbove10: 0,
      studentsBelow10: 0,
      students: []
    };
  }

  // Calculs statistiques
  const averagesValues = allBulletins.map(b => b.generalAverage).sort((a, b) => a - b);
  const sum = averagesValues.reduce((a, b) => a + b, 0);
  const classAverage = parseFloat((sum / averagesValues.length).toFixed(2));
  
  const highest = averagesValues[averagesValues.length - 1];
  const lowest = averagesValues[0];

  // Médiane
  const mid = Math.floor(averagesValues.length / 2);
  const median = averagesValues.length % 2 !== 0 
    ? averagesValues[mid] 
    : (averagesValues[mid - 1] + averagesValues[mid]) / 2;

  const studentsAbove10 = averagesValues.filter(v => v >= 10).length;
  const studentsBelow10 = averagesValues.length - studentsAbove10;

  // Liste des élèves classés
  const rankedStudents = allBulletins
    .map(b => {
      const sInfo = students.find(s => s._id.toString() === b.student.toString());
      return {
        studentId: b.student,
        studentName: sInfo ? `${sInfo.firstName} ${sInfo.lastName}` : "Élève inconnu",
        average: b.generalAverage
      };
    })
    .sort((a, b) => b.average - a.average)
    .map((s, index) => ({ ...s, rank: index + 1 }));

  return {
    classId,
    className: currentClass.name,
    periodId,
    classAverage,
    highest,
    lowest,
    median: parseFloat(median.toFixed(2)),
    studentsAbove10,
    studentsBelow10,
    students: rankedStudents
  };
};

/**
 * Calculer la moyenne d'une matière spécifique pour une classe,
 * en listant tous les élèves de la classe et la moyenne générale de la classe
 * pour cette matière donnée.
 */
const getSubjectAveragesForClass = async (classId, subjectId, periodId) => {
  // 1. Récupérer tous les élèves actifs de la classe
  const students = await Student.find({ class: classId, isActive: true })
    .select("firstName lastName matricule photo")
    .lean();

  if (students.length === 0) {
    return { classSubjectAverage: 0, studentAverages: [] };
  }

  // 2. Récupérer toutes les évaluations de la matière pour la classe et la période
  let evalQuery = {
    class: classId,
    subject: subjectId
  };

  const Period = require("../periods/period.model");
  const period = await Period.findById(periodId);
  if (period && period.type === "TRIMESTRE") {
    const childSequences = await Period.find({ parentPeriod: periodId }).select("_id");
    evalQuery.period = { $in: [periodId, ...childSequences.map(s => s._id)] };
  } else {
    evalQuery.period = periodId;
  }

  const evaluations = await Evaluation.find(evalQuery).lean();

  if (evaluations.length === 0) {
    return {
      classSubjectAverage: 0,
      studentAverages: students.map(s => ({ student: s, average: null }))
    };
  }

  const evaluationIds = evaluations.map(e => e._id);

  // 3. Récupérer toutes les notes des élèves pour ces évaluations
  const grades = await Grade.find({
    student: { $in: students.map(s => s._id) },
    evaluation: { $in: evaluationIds }
  }).lean();

  // 4. Calcul de la moyenne par élève pour cette matière
  const studentAverages = students.map(student => {
    let totalScore = 0;
    let totalCoef = 0;

    evaluations.forEach(evalItem => {
      // Trouver la note de cet élève pour cette évaluation
      const grade = grades.find(
        g => g.student.toString() === student._id.toString() &&
          g.evaluation.toString() === evalItem._id.toString()
      );

      if (grade && grade.score != null) {
        // Normaliser sur 20
        const normalizedScore = (grade.score / evalItem.maxScore) * 20;
        totalScore += normalizedScore * evalItem.coefficient;
        totalCoef += evalItem.coefficient;
      }
    });

    const average = totalCoef ? parseFloat((totalScore / totalCoef).toFixed(2)) : null;

    return {
      student,
      average,
      totalEvaluations: grades.filter(g => g.student.toString() === student._id.toString()).length
    };
  });

  // 5. Calcul de la moyenne générale de la classe pour la matière
  const studentsWithGrades = studentAverages.filter(s => s.average !== null);
  const classSum = studentsWithGrades.reduce((sum, s) => sum + s.average, 0);
  const classSubjectAverage = studentsWithGrades.length
    ? parseFloat((classSum / studentsWithGrades.length).toFixed(2))
    : 0;

  return {
    classSubjectAverage,
    studentAverages
  };
};

/**
 * Récupère l'ensemble des notes d'une classe pour une période et/ou une matière.
 * Retourne les élèves, les évaluations et les notes pour construire une grille de saisie.
 */
const getGradesByClass = async (classId, { periodId, subjectId } = {}) => {
  // 1. Récupérer les élèves de la classe
  const students = await Student.find({ class: classId, isActive: true })
    .select("firstName lastName matricule photo")
    .lean();

  // 2. Construire la requête pour les évaluations
  const evalQuery = { class: classId };
  if (periodId) {
    const Period = require("../periods/period.model");
    const period = await Period.findById(periodId);
    if (period && period.type === "TRIMESTRE") {
      const childSequences = await Period.find({ parentPeriod: periodId }).select("_id");
      evalQuery.period = { $in: [periodId, ...childSequences.map(s => s._id)] };
    } else {
      evalQuery.period = periodId;
    }
  }
  if (subjectId) evalQuery.subject = subjectId;

  const evaluations = await Evaluation.find(evalQuery)
    .populate("subject", "name")
    .populate("period", "name")
    .sort({ date: 1 })
    .lean();

  const evalIds = evaluations.map(e => e._id);

  // 3. Récupérer toutes les notes pour ces évaluations et ces élèves
  const grades = await Grade.find({
    evaluation: { $in: evalIds },
    student: { $in: students.map(s => s._id) }
  }).lean();

  return {
    students,
    evaluations: evaluations.map(e => ({
      id: e._id,
      name: e.name,
      subject: e.subject?.name,
      maxScore: e.maxScore,
      coefficient: e.coefficient,
      date: e.date,
      isPublished: e.isPublished
    })),
    grades: grades.map(g => ({
      studentId: g.student,
      evaluationId: g.evaluation,
      score: g.score,
      comment: g.comment
    }))
  };
};

module.exports = {
  upsertGrade,
  getGradesByStudent,
  deleteGrade,
  getStudentAverages,
  getClassAverages,
  getSubjectAveragesForClass,
  getGradesByClass
};
