const service = require("./class.service");

/**
 * Créer une classe
 */
const create = async (req, res) => {
  const classe = await service.createClass(req.body);
  res.status(201).json(classe);
};

/**
 * Récupérer toutes les classes
 */
const getAll = async (req, res) => {
  const { schoolYearId } = req.query;
  const classes = await service.getAllClasses(schoolYearId);
  res.json(classes);
};

const update = async (req, res) => {
  const classe = await service.updateClass(req.params.id, req.body);
  res.json(classe);
};

const remove = async (req, res) => {
  await service.deleteClass(req.params.id);
  res.status(204).send();
};

/**
 * Import des classes
 */
const importClasses = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Fichier requis" });
  const result = await service.importClassesFromExcel(req.file.buffer);
  res.json(result);
};

/**
 * Détails complets d'une classe
 */
const details = async (req, res) => {
  const classe = await service.getClassDetails(req.params.id);
  res.json(classe);
};

/**
 * Ajouter un élève à une classe
 */
const addStudent = async (req, res) => {
  const { classId, studentId } = req.params;
  const classe = await service.addStudentToClass(classId, studentId);
  res.json(classe);
};

/**
 * Ajouter une matière à une classe
 */
const addSubject = async (req, res) => {
  const { classId, subjectId } = req.params;
  const classe = await service.addSubjectToClass(classId, subjectId);
  res.json(classe);
};

/**
 * Ajouter un enseignant à une classe
 */
const addTeacher = async (req, res) => {
  const { classId, teacherId } = req.params;
  const classe = await service.addTeacherToClass(classId, teacherId);
  res.json(classe);
};

/**
 * Élèves d'une classe
 */
const getStudents = async (req, res) => {
  const students = await service.getClassStudents(req.params.id);
  res.json(students);
};

/**
 * Matières d'une classe
 */
const getSubjects = async (req, res) => {
  const subjects = await service.getClassSubjects(req.params.id);
  res.json(subjects);
};

/**
 * Enseignants d'une classe
 */
const getTeachers = async (req, res) => {
  const teachers = await service.getClassTeachers(req.params.id);
  res.json(teachers);
};

module.exports = {
  create,
  getAll,
  details,
  update,
  remove,
  importClasses,
  addStudent,
  addSubject,
  addTeacher,
  getStudents,
  getSubjects,
  getTeachers
};
