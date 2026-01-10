const Bulletin = require("./bulletin.model");
const Grade = require("../grades/grade.model");
const Evaluation = require("../evaluations/evaluation.model");
const Student = require("../students/student.model");

/**
 * Générer ou mettre à jour le bulletin d’un élève
 * Règles métier :
 * - Moyenne calculée automatiquement
 * - Données issues uniquement des évaluations de la période
 * - Bulletin unique par (élève + période)
 */
const calculateBulletin = async (studentId, classId, periodId) => {

  // 🧠 Sécurité : vérifier que l’élève existe
  const studentExists = await Student.findById(studentId);
  if (!studentExists) {
    throw new Error("Student not found");
  }

  // 1️⃣ Récupération des évaluations de la classe sur la période
  const evaluations = await Evaluation.find({
    class: classId,
    period: periodId
  })
    .populate("subject")
    .lean();

  if (!evaluations.length) {
    throw new Error("No evaluations found for this period");
  }

  // 2️⃣ Récupération des notes de l’élève pour ces évaluations
  const grades = await Grade.find({
    student: studentId,
    evaluation: { $in: evaluations.map(e => e._id) }
  });

  /**
   * 3️⃣ Calcul des moyennes par matière
   * Règle :
   * - Moyenne pondérée par coefficient
   * - Une matière = plusieurs évaluations possibles
   */
  const subjectsMap = {};

  evaluations.forEach(evalItem => {
    const grade = grades.find(
      g => g.evaluation.toString() === evalItem._id.toString()
    );

    // Initialisation de la matière
    if (!subjectsMap[evalItem.subject._id]) {
      subjectsMap[evalItem.subject._id] = {
        total: 0,
        coef: 0
      };
    }

    // Addition pondérée si une note existe
    if (grade && grade.score != null) {
      subjectsMap[evalItem.subject._id].total +=
        grade.score * evalItem.coefficient;

      subjectsMap[evalItem.subject._id].coef += evalItem.coefficient;
    }
  });

  // Transformation en tableau exploitable
  const averages = Object.entries(subjectsMap).map(
    ([subjectId, { total, coef }]) => ({
      subject: subjectId,
      average: coef ? total / coef : 0
    })
  );

  /**
   * 4️⃣ Calcul de la moyenne générale de la période
   * Règle :
   * - Moyenne simple des moyennes par matière
   */
  const totalSum = averages.reduce((sum, a) => sum + a.average, 0);
  const generalAverage = averages.length
    ? totalSum / averages.length
    : 0;

  /**
   * 5️⃣ Création ou mise à jour du bulletin
   * - Un seul bulletin par élève et par période
   * - Recalculable tant qu’il n’est pas publié
   */
  const bulletin = await Bulletin.findOneAndUpdate(
    { student: studentId, period: periodId },
    {
      student: studentId,
      class: classId,
      period: periodId,
      averages,
      generalAverage
    },
    { new: true, upsert: true }
  );

  return bulletin;
};

/**
 * Publication du bulletin
 * Règle :
 * - Après publication → données figées
 */
const publishBulletin = async (bulletinId) => {
  const bulletin = await Bulletin.findById(bulletinId);
  if (!bulletin) throw new Error("Bulletin not found");

  bulletin.isPublished = true;
  await bulletin.save();
  return bulletin;
};

/**
 * Récupération des bulletins d’une classe
 */
const getBulletinsByClass = async (classId, periodId) => {
  return Bulletin.find({ class: classId, period: periodId })
    .populate("student", "firstName lastName")
    .populate("averages.subject", "name code")
    .lean();
};

/**
 * Accès parent : uniquement bulletins publiés
 */
const getPublishedByParent = async (parentId, periodId = null) => {
  const StudentParent = require("../students/student.model");

  // Enfants rattachés au parent
  const childrenIds = await StudentParent
    .find({ parent: parentId })
    .distinct("student");

  const query = {
    student: { $in: childrenIds },
    isPublished: true
  };

  if (periodId) query.period = periodId;

  return Bulletin.find(query)
    .populate("student", "firstName lastName")
    .populate("class", "name level")
    .populate("averages.subject", "name code")
    .lean();
};

/**
 * Calcul automatique du rang par classe et période
 * ⚠️ Interdit si les bulletins sont déjà publiés
 */
const calculateRanksForClass = async (classId, periodId) => {
  const bulletins = await Bulletin.find({
    class: classId,
    period: periodId
  }).sort({ generalAverage: -1 });

  if (!bulletins.length) {
    throw new Error("No bulletins found");
  }

  // 🔒 Sécurité : rang recalculable uniquement AVANT publication
  const publishedExists = bulletins.some(b => b.isPublished);
  if (publishedExists) {
    throw new Error("Ranks cannot be recalculated after publication");
  }

  let currentRank = 1;

  for (let i = 0; i < bulletins.length; i++) {
    if (
      i > 0 &&
      bulletins[i].generalAverage < bulletins[i - 1].generalAverage
    ) {
      currentRank = i + 1;
    }

    bulletins[i].rank = currentRank;
    await bulletins[i].save();
  }

  return bulletins;
};



module.exports = {
  calculateBulletin,
  publishBulletin,
  getBulletinsByClass,
  getPublishedByParent,
  calculateRanksForClass
};
