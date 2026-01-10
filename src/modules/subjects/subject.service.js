const Subject = require("./subject.model");
const Evaluation = require("../evaluations/evaluation.model");

// Créer une matière
const createSubject = async (data) => {
  console.log("[SERVICE] Création du sujet avec données :", data);
  const subject = await Subject.create(data);
  console.log("[SERVICE] Sujet créé :", subject);
  return subject;
};

// Modifier une matière
const updateSubject = async (id, data) => {
  console.log("[SERVICE] Mise à jour du sujet :", id, data);
  const subject = await Subject.findByIdAndUpdate(id, data, { new: true });
  console.log("[SERVICE] Sujet mis à jour :", subject);
  return subject;
};

// Liste des matières actives
const getActiveSubjects = async () => {
  const subjects = await Subject.find({ isActive: true });
  console.log("[SERVICE] Sujets actifs :", subjects.length);
  return subjects;
};

// Désactiver une matière (soft delete)
const disableSubject = async (id) => {
  console.log("[SERVICE] Désactivation du sujet :", id);
  const subject = await Subject.findByIdAndUpdate(id, { isActive: false }, { new: true });
  console.log("[SERVICE] Sujet désactivé :", subject);
  return subject;
};

// Récupérer par code
const getSubjectByCode = async (code) => {
  return await Subject.findOne({ code: code.toUpperCase() });
};

module.exports = {
  createSubject,
  updateSubject,
  getActiveSubjects,
  disableSubject,
  getSubjectByCode
};
