const Evaluation = require("./evaluation.model");
const Grade = require("../grades/grade.model");
const Period = require("../periods/period.model");
const { isTeacherAssigned } = require("../teachers/teacherAssignment.service");
const notificationService = require("../notifications/notification.service");

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

  // 🔔 Notification
  await notificationService.createNotification({
    user: teacher,
    title: "Évaluation créée",
    message: `L'évaluation "${evaluation.name}" a été créée avec succès.`,
    type: "SUCCESS"
  });

  return evaluation;
};

/**
 * Modification d'une évaluation
 * Règles métier :
 * 1. Seul le prof créateur peut modifier
 * 2. Impossible si l’évaluation est publiée
 * 3. Impossible si la période est clôturée
 */
const updateEvaluation = async (evaluationId, teacherId, updates) => {
  console.log("✏️ updateEvaluation called");
  console.log("evaluationId:", evaluationId);
  console.log("teacherId:", teacherId);
  console.log("updates:", updates);

  // Récupération de l’évaluation avec relations
  const evaluation = await Evaluation.findById(evaluationId)
    .populate("period")
    .populate("subject")
    .populate("class");

  console.log("📌 Fetched evaluation:", evaluation);

  if (!evaluation) {
    console.error("❌ Evaluation not found");
    throw new Error("Evaluation not found");
  }

  if (evaluation.teacher.toString() !== teacherId.toString()) {
    console.error("❌ Teacher not allowed to edit this evaluation");
    throw new Error("Teacher not allowed to edit this evaluation");
  }

  // 📝 Mapping des champs frontend -> backend
  if (updates.title) updates.name = updates.title;
  if (updates.subjectId) updates.subject = updates.subjectId;
  if (updates.classId) updates.class = updates.classId;
  if (updates.periodId) updates.period = updates.periodId;

  if (evaluation.isPublished) {
    console.error("❌ Published evaluation cannot be edited");
    throw new Error("Published evaluation cannot be edited");
  }

  if (evaluation.period?.isClosed) {
    console.error("❌ Period is closed. Edition forbidden");
    throw new Error("Period is closed. Evaluation edition forbidden.");
  }

  const allowedFields = [
    "name",
    "date",
    "maxScore",
    "coefficient",
    "subject",
    "period",
    "isPublished"
  ];

  // Mise à jour des champs autorisés
  allowedFields.forEach((field) => {
  const value = updates[field];

  if (
    value !== undefined &&
    value !== null &&
    value !== ""
  ) {
    console.log(`🔄 Updating field '${field}' =>`, value);
    evaluation[field] = value;
  }
});


  await evaluation.save();
  console.log("✅ Evaluation saved");

  // Adaptation pour le frontend (DTO)
  const dto = {
    id: evaluation._id.toString(),
    title: evaluation.name,
    classId: evaluation.class._id.toString(),
    className: evaluation.class.name,
    subjectId: evaluation.subject._id.toString(),
    subject: evaluation.subject.name,
    periodId: evaluation.period._id.toString(),
    period: evaluation.period.name,
    date: evaluation.date,
    maxScore: evaluation.maxScore,
    coefficient: evaluation.coefficient,
    isPublished: evaluation.isPublished,
  };

  console.log("📤 Returning DTO:", dto);

  return dto;
};


/**
 * Récupération des évaluations par classe (+ période optionnelle)
 */
// evaluation.service.js
const getEvaluationsByClass = async (classId, periodId) => {
  if (!classId) throw new Error("classId is required");

  let query = { class: classId };
  const Period = require("../periods/period.model");

  if (periodId) {
    const period = await Period.findById(periodId);
    if (period && period.type === "TRIMESTRE") {
      const childSequences = await Period.find({ parentPeriod: periodId }).select("_id");
      const periodIds = [periodId, ...childSequences.map(s => s._id)];
      query.period = { $in: periodIds };
    } else {
      query.period = periodId;
    }
  } else {
    const activePeriod = await Period.findOne({ isActive: true });

    if (activePeriod) {
      if (activePeriod.type === "TRIMESTRE") {
        const childSequences = await Period.find({ parentPeriod: activePeriod._id }).select("_id");
        const periodIds = [activePeriod._id, ...childSequences.map(s => s._id)];
        query.period = { $in: periodIds };
      } else {
        query.period = activePeriod._id;
      }
      console.log("🟢 Période active détectée =", activePeriod.name);
    } else {
      console.warn("⚠️ Aucune période active trouvée");
    }
  }

  console.log("📦 Mongo query finale =", query);

  const evaluations = await Evaluation.find(query)
    .populate("subject", "name")
    .populate("teacher", "firstName lastName")
    .populate("period", "name isActive")
    .populate("class", "name level")
    .sort({ createdAt: -1 })
    .lean();

  // Calculer le nombre de notes pour chaque évaluation
  const evaluationIds = evaluations.map(e => e._id);
  const gradeCounts = await Grade.aggregate([
    { $match: { evaluation: { $in: evaluationIds } } },
    { $group: { _id: "$evaluation", count: { $sum: 1 } } }
  ]);

  const countMap = gradeCounts.reduce((acc, curr) => {
    acc[curr._id.toString()] = curr.count;
    return acc;
  }, {});

  return evaluations.map(e => ({
    ...e,
    id: e._id, // Assurer que id est présent
    gradesCount: countMap[e._id.toString()] || 0
  }));
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

  // 🔔 Notification
  await notificationService.createNotification({
    user: evaluation.teacher,
    title: "Évaluation publiée",
    message: `L'évaluation "${evaluation.name}" est désormais visible par les parents.`,
    type: "SUCCESS"
  });

  return evaluation;
};

const getGradesForEvaluation = async (evaluationId) => {
  return Grade.find({ evaluation: evaluationId })
    .populate("student", "firstName lastName");
};

/**
 * Suppression d'une évaluation
 * Règles de sécurité :
 * 1. Seul le créateur peut supprimer
 * 2. Impossible si publiée (doit d'abord dépublier)
 * 3. Impossible si la période est clôturée
 */
const deleteEvaluation = async (evaluationId, teacherId) => {
  console.log("🗑️ deleteEvaluation called with id:", evaluationId, "by teacher:", teacherId);
  
  // Récupérer l'évaluation avec sa période
  const evaluation = await Evaluation.findById(evaluationId).populate("period");

  if (!evaluation) {
    console.warn("❌ Evaluation not found for deletion:", evaluationId);
    throw new Error("Evaluation not found");
  }

  // 1. Vérification du créateur
  if (evaluation.teacher.toString() !== teacherId.toString()) {
    console.warn("❌ Authorization failed: creator is", evaluation.teacher, "but requester is", teacherId);
    throw new Error("Teacher not allowed to delete this evaluation");
  }

  // 2. Vérification statut Publié
  if (evaluation.isPublished) {
    console.warn("❌ Deletion rejected: evaluation is published");
    throw new Error("Impossible de supprimer une évaluation publiée. Veuillez d'abord la dépublier.");
  }

  // 3. Vérification Période clôturée
  if (evaluation.period?.isClosed) {
    console.warn("❌ Deletion rejected: period is closed");
    throw new Error("Impossible de supprimer une évaluation car la période est clôturée.");
  }

  // Supprimer les notes associées
  const gradesDeleted = await Grade.deleteMany({ evaluation: evaluationId });
  console.log("✅ Associated grades deleted:", gradesDeleted.deletedCount);
  
  // Supprimer l'évaluation
  await Evaluation.findByIdAndDelete(evaluationId);
  console.log("✅ Evaluation deleted successfully");

  return { message: "Evaluation and associated grades deleted" };
};

/**
 * Dépublication d'une évaluation
 */
const unpublishEvaluation = async (evaluationId, teacherId) => {
  const evaluation = await Evaluation.findById(evaluationId).populate("period");

  if (!evaluation) throw new Error("Evaluation not found");

  if (evaluation.teacher.toString() !== teacherId.toString()) {
    throw new Error("Teacher not allowed to unpublish this evaluation");
  }

  if (evaluation.period?.isClosed) {
    throw new Error("Impossible de modifier une évaluation car la période est clôturée.");
  }

  evaluation.isPublished = false;
  await evaluation.save();

  // On repeuple pour avoir les noms (Matière, Classe) dans le DTO
  const updated = await Evaluation.findById(evaluationId)
    .populate("period")
    .populate("subject")
    .populate("class");

  return {
    id: updated._id.toString(),
    title: updated.name,
    classId: updated.class._id.toString(),
    className: updated.class.name,
    subjectId: updated.subject._id.toString(),
    subject: updated.subject.name,
    periodId: updated.period._id.toString(),
    period: updated.period.name,
    date: updated.date,
    maxScore: updated.maxScore,
    coefficient: updated.coefficient,
    isPublished: updated.isPublished,
  };
};

/**
 * Dépublication en masse d'évaluations
 */
const unpublishManyEvaluations = async (evaluationIds, teacherId) => {
  const results = {
    success: [],
    errors: []
  };

  for (const id of evaluationIds) {
    try {
      const evaluation = await Evaluation.findById(id).populate("period");
      if (!evaluation) {
        results.errors.push({ id, error: "Non trouvé" });
        continue;
      }

      if (evaluation.teacher.toString() !== teacherId.toString()) {
        results.errors.push({ id, error: "Non autorisé" });
        continue;
      }

      if (evaluation.period?.isClosed) {
        results.errors.push({ id, error: "Période clôturée" });
        continue;
      }

      evaluation.isPublished = false;
      await evaluation.save();
      results.success.push(id);
    } catch (err) {
      results.errors.push({ id, error: err.message });
    }
  }

  return results;
};

module.exports = {
  createEvaluation,
  addGrade,
  updateGrade,
  updateEvaluation,
  publishEvaluation,
  unpublishEvaluation,
  unpublishManyEvaluations,
  getGradesForEvaluation,
  getEvaluationsByClass,
  deleteEvaluation
};
