const Bulletin = require("./bulletin.model");
const Grade = require("../grades/grade.model");
const Evaluation = require("../evaluations/evaluation.model");
const Student = require("../students/student.model");

/**
 * Générer ou mettre à jour le bulletin d'un élève
 * Règles métier :
 * - Moyenne calculée automatiquement
 * - Scores normalisés sur /20
 * - Moyenne par matière pondérée par coefficient d'évaluation
 * - Moyenne générale pondérée par coefficient de matière
 * - Bulletin unique par (élève + période)
 */
const calculateBulletin = async (studentId, classId, periodId) => {

  // 🧠 Sécurité : vérifier que l'élève existe
  const studentExists = await Student.findById(studentId);
  if (!studentExists) {
    throw new Error("Student not found");
  }

  // 0️⃣ Déterminer si on travaille sur une séquence ou un trimestre
  const Period = require("../periods/period.model");
  const period = await Period.findById(periodId);
  if (!period) throw new Error("Period not found");

  const ClassModel = require("../classes/class.model");
  const classDoc = await ClassModel.findById(classId);
  if (!classDoc) throw new Error("Class not found");

  // Création du dictionnaire des matières de la classe
  const classSubjectMap = {};
  if (classDoc.subjects && classDoc.subjects.length > 0) {
    classDoc.subjects.forEach(s => {
      if (s.subject) {
        classSubjectMap[s.subject.toString()] = {
          coefficient: s.coefficient || 1,
          group: s.group || 1
        };
      }
    });
  }

  let periodIds = [periodId];
  
  // Si c'est un trimestre, on récupère les IDs des séquences rattachées
  if (period.type === "TRIMESTRE") {
    const childSequences = await Period.find({ parentPeriod: periodId }).select("_id");
    periodIds = [periodId, ...childSequences.map(s => s._id)];
    console.log(`📊 Agrégation Trimestre: périodes à inclure = ${periodIds.length}`);
  }

  // 1️⃣ Récupération des évaluations de la classe sur la ou les périodes
  const evaluations = await Evaluation.find({
    class: classId,
    period: { $in: periodIds }
  })
    .populate("subject", "name code coefficient")
    .lean();

  if (!evaluations.length) {
    throw new Error("No evaluations found for this period");
  }

  // 2️⃣ Récupération des notes de l'élève pour ces évaluations
  const grades = await Grade.find({
    student: studentId,
    evaluation: { $in: evaluations.map(e => e._id) }
  }).lean();

  /**
   * 3️⃣ Calcul des moyennes par matière
   * Règles :
   * - Normalisation du score sur /20 : (score / maxScore) × 20
   * - Moyenne pondérée par le coefficient de l'évaluation
   * - Une matière = plusieurs évaluations possibles
   */
  const subjectsMap = {};

  evaluations.forEach(evalItem => {
    const grade = grades.find(
      g => g.evaluation.toString() === evalItem._id.toString()
    );

    const subjectId = evalItem.subject._id.toString();
    const classSubj = classSubjectMap[subjectId] || { 
      coefficient: evalItem.subject.coefficient || 1, 
      group: 1 
    };

    // Initialisation de la matière
    if (!subjectsMap[subjectId]) {
      subjectsMap[subjectId] = {
        total: 0,
        coef: 0,
        subjectCoefficient: classSubj.coefficient,
        group: classSubj.group
      };
    }

    // Addition pondérée si une note existe (score normalisé sur /20)
    if (grade && grade.score != null) {
      const normalizedScore = (grade.score / evalItem.maxScore) * 20;
      subjectsMap[subjectId].total += normalizedScore * evalItem.coefficient;
      subjectsMap[subjectId].coef += evalItem.coefficient;
    }
  });

  // Transformation en tableau exploitable
  const averages = Object.entries(subjectsMap).map(
    ([subjectId, { total, coef, subjectCoefficient, group }]) => ({
      subject: subjectId,
      average: coef ? parseFloat((total / coef).toFixed(2)) : 0,
      coefficient: subjectCoefficient,
      group: group
    })
  );

  /**
   * 4️⃣ Calcul de la moyenne générale de la période
   * Règle : moyenne pondérée par le coefficient de la matière
   * Formule : Σ (moyenneMatière × coefMatière) / Σ coefMatière
   */
  const totalWeighted = averages.reduce(
    (sum, a) => sum + a.average * a.coefficient, 0
  );
  const totalCoef = averages.reduce(
    (sum, a) => sum + a.coefficient, 0
  );
  const generalAverage = totalCoef
    ? parseFloat((totalWeighted / totalCoef).toFixed(2))
    : 0;

  /**
   * 5️⃣ Création ou mise à jour du bulletin
   * - Un seul bulletin par élève et par période
   * - Recalculable tant qu'il n'est pas publié
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
 * Récupération des bulletins d'une classe
 */
const getBulletinsByClass = async (classId, periodId) => {
  return Bulletin.find({ class: classId, period: periodId })
    .populate("student", "firstName lastName")
    .populate("averages.subject", "name code coefficient")
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
    .populate("averages.subject", "name code coefficient")
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
