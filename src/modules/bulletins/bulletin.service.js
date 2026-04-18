const Bulletin = require("./bulletin.model");
const Grade = require("../grades/grade.model");
const Evaluation = require("../evaluations/evaluation.model");
const Student = require("../students/student.model");
const Period = require("../periods/period.model");
const ClassSubject = require("../classes/classSubject.model");

/**
 * Récupère les matières assignées à une classe.
 * Essaie d'abord avec schoolYearId, puis sans si aucun résultat.
 */
const getClassSubjects = async (classId, schoolYearId) => {
  // Tentative 1: avec schoolYearId précis
  if (schoolYearId) {
    const withYear = await ClassSubject.find({ classId, schoolYearId })
      .populate("subjectId", "name code coefficient")
      .lean();
    if (withYear.length > 0) {
      console.log(`✅ ClassSubjects avec schoolYearId: ${withYear.length} matières`);
      return withYear;
    }
    console.warn(`⚠️ Aucune ClassSubject avec classId=${classId} et schoolYearId=${schoolYearId}. Essai sans filtre d'année...`);
  }

  // Tentative 2: juste par classId (fallback)
  const withoutYear = await ClassSubject.find({ classId })
    .populate("subjectId", "name code coefficient")
    .lean();
  console.log(`📋 ClassSubjects sans filtre année: ${withoutYear.length} matières`);
  return withoutYear;
};

/**
 * LOGIQUE MÉTIER:
 * - SÉQUENCE : Les évaluations sont directement liées à une période SÉQUENCE.
 *   Bulletin Séquence = moyenne pondérée des notes d'évaluation de cette période.
 * - TRIMESTRE : Composé de 2 séquences (SEQUENCE.parentPeriod = TRIMESTRE._id).
 *   Bulletin Trimestre = (Moy. Séq. 1 + Moy. Séq. 2) / 2 pour chaque matière.
 *   IMPORTANT: Les bulletins de Séquence doivent exister AVANT de générer le Trimestre.
 */
const calculateBulletin = async (studentId, classId, periodId) => {
  const studentExists = await Student.findById(studentId);
  if (!studentExists) throw new Error("Student not found");

  const period = await Period.findById(periodId);
  if (!period) throw new Error("Period not found");

  const ClassModel = require("../classes/class.model");
  const classDoc = await ClassModel.findById(classId);
  if (!classDoc) throw new Error("Class not found");

  console.log(`\n📝 Calcul bulletin - Étudiant: ${studentId} | Classe: ${classId} | Période: ${period.name} (${period.type})`);
  console.log(`   Class.schoolYearId = ${classDoc.schoolYearId}`);

  // Master list des matières de la classe (avec fallback)
  const classSubjects = await getClassSubjects(classId, classDoc.schoolYearId);

  if (!classSubjects.length) {
    throw new Error(`Aucune matière configurée pour cette classe (ClassSubject vide pour classId=${classId}).`);
  }
  console.log(`   Matières trouvées: ${classSubjects.map(cs => cs.subjectId?.name || cs.subjectId).join(', ')}`);

  // ============================================================
  // 🔹 LOGIQUE TRIMESTRE
  // ============================================================
  if (period.type === "TRIMESTRE") {
    const childSequences = await Period.find({ parentPeriod: periodId, type: "SEQUENCE" }).select("_id name");
    console.log(`   Séquences enfants: ${childSequences.map(s => s.name).join(', ') || 'AUCUNE'}`);
    
    if (!childSequences.length) {
      throw new Error(`Aucune Séquence (type=SEQUENCE, parentPeriod=${periodId}) trouvée pour ce Trimestre.`);
    }
    const numSequences = childSequences.length;

    const seqBulletins = await Bulletin.find({
      student: studentId,
      class: classId,
      period: { $in: childSequences.map(s => s._id) }
    }).lean();
    console.log(`   Bulletins de séquence existants: ${seqBulletins.length}`);

    const averages = classSubjects.map(cs => {
      const subjectId = (cs.subjectId?._id || cs.subjectId).toString();
      let totalAverage = 0;

      seqBulletins.forEach(b => {
        const match = b.averages?.find(a => a.subject?.toString() === subjectId);
        if (match) totalAverage += (match.average || 0);
      });

      return {
        subject: subjectId,
        average: parseFloat((totalAverage / numSequences).toFixed(2)),
        coefficient: cs.coefficient || 1,
        group: cs.group || 1
      };
    });

    const totalWeighted = averages.reduce((sum, a) => sum + (a.average * a.coefficient), 0);
    const totalCoef = averages.reduce((sum, a) => sum + a.coefficient, 0);
    const generalAverage = totalCoef ? parseFloat((totalWeighted / totalCoef).toFixed(2)) : 0;
    console.log(`   ✅ Trimestre calculé: moyenne=${generalAverage} sur ${averages.length} matières`);

    return await Bulletin.findOneAndUpdate(
      { student: studentId, period: periodId },
      { student: studentId, class: classId, period: periodId, averages, generalAverage },
      { new: true, upsert: true }
    );
  }

  // ============================================================
  // 🔹 LOGIQUE SÉQUENCE
  // ============================================================
  const evaluations = await Evaluation.find({ class: classId, period: periodId }).lean();
  const grades = await Grade.find({
    student: studentId,
    evaluation: { $in: evaluations.map(e => e._id) }
  }).lean();
  console.log(`   Évaluations trouvées: ${evaluations.length} | Notes: ${grades.length}`);

  const averages = classSubjects.map(cs => {
    const subjectId = (cs.subjectId?._id || cs.subjectId).toString();
    const subjectEvals = evaluations.filter(e => e.subject?.toString() === subjectId);
    let totalScore = 0, totalEvalCoef = 0;

    subjectEvals.forEach(evalItem => {
      const grade = grades.find(g => g.evaluation.toString() === evalItem._id.toString());
      if (grade && grade.score != null) {
        const normalizedScore = (grade.score / evalItem.maxScore) * 20;
        totalScore += normalizedScore * (evalItem.coefficient || 1);
        totalEvalCoef += (evalItem.coefficient || 1);
      }
    });

    return {
      subject: subjectId,
      average: totalEvalCoef ? parseFloat((totalScore / totalEvalCoef).toFixed(2)) : 0,
      coefficient: cs.coefficient || 1,
      group: cs.group || 1
    };
  });

  const totalWeighted = averages.reduce((sum, a) => sum + (a.average * a.coefficient), 0);
  const totalCoef = averages.reduce((sum, a) => sum + a.coefficient, 0);
  const generalAverage = totalCoef ? parseFloat((totalWeighted / totalCoef).toFixed(2)) : 0;
  console.log(`   ✅ Séquence calculée: moyenne=${generalAverage} sur ${averages.length} matières`);

  return await Bulletin.findOneAndUpdate(
    { student: studentId, period: periodId },
    { student: studentId, class: classId, period: periodId, averages, generalAverage },
    { new: true, upsert: true }
  );
};

const publishBulletin = async (bulletinId) => {
  const bulletin = await Bulletin.findById(bulletinId);
  if (!bulletin) throw new Error("Bulletin not found");
  bulletin.isPublished = true;
  await bulletin.save();
  return bulletin;
};

const getBulletinsByClass = async (classId, periodId) => {
  return Bulletin.find({ class: classId, period: periodId })
    .populate("student", "firstName lastName")
    .populate("averages.subject", "name code coefficient")
    .sort({ generalAverage: -1 })
    .lean();
};

const getPublishedByParent = async (parentId, periodId = null) => {
  const StudentModel = require("../students/student.model");
  const childrenDocs = await StudentModel.find({ parent: parentId });
  const childrenIds = childrenDocs.map(c => c._id);
  const query = { student: { $in: childrenIds }, isPublished: true };
  if (periodId) query.period = periodId;
  return Bulletin.find(query)
    .populate("student", "firstName lastName")
    .populate("class", "name level")
    .populate("averages.subject", "name code coefficient")
    .sort({ generalAverage: -1 })
    .lean();
};

const calculateRanksForClass = async (classId, periodId) => {
  const bulletins = await Bulletin.find({ class: classId, period: periodId }).sort({ generalAverage: -1 });
  if (!bulletins.length) return [];
  let currentRank = 1;
  for (let i = 0; i < bulletins.length; i++) {
    if (i > 0 && bulletins[i].generalAverage < bulletins[i - 1].generalAverage) {
      currentRank = i + 1;
    }
    await Bulletin.updateOne({ _id: bulletins[i]._id }, { rank: currentRank });
    bulletins[i].rank = currentRank;
  }
  return bulletins;
};

const getAllBulletins = async (periodId, classId) => {
  const query = {};
  if (periodId && periodId !== "all") query.period = periodId;
  if (classId && classId !== "all") query.class = classId;
  const bulletins = await Bulletin.find(query)
    .populate("student", "firstName lastName matricule photo")
    .populate("class", "name level")
    .populate("period", "name type isActive")
    .sort({ generalAverage: -1 })
    .lean();
  return bulletins.filter(b => b.student);
};

const getBulletinById = async (bulletinId) => {
  const bulletin = await Bulletin.findById(bulletinId)
    .populate("student", "firstName lastName matricule photo")
    .populate("class", "name level")
    .populate("period", "name type isActive parentPeriod")
    .populate("averages.subject", "name code coefficient group")
    .lean();
  if (!bulletin) return null;

  if (bulletin.period && bulletin.period.type === "TRIMESTRE") {
    const childSequences = await Period.find({
      parentPeriod: bulletin.period._id,
      type: "SEQUENCE"
    }).select("_id name").lean();

    if (childSequences.length > 0) {
      const seqBulletins = await Bulletin.find({
        student: bulletin.student?._id,
        period: { $in: childSequences.map(s => s._id) }
      }).populate("period", "name").lean();
      bulletin.childBulletins = seqBulletins;
    }
  }
  return bulletin;
};

module.exports = {
  calculateBulletin,
  publishBulletin,
  getBulletinsByClass,
  getPublishedByParent,
  calculateRanksForClass,
  getAllBulletins,
  getBulletinById
};
