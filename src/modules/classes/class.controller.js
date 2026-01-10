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
  const classes = await service.getAllClasses();
  res.json(classes);
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
 * Détails complets d'une classe
 */
const details = async (req, res) => {
  const classe = await service.getClassDetails(req.params.id);
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
  addStudent,
  addSubject,
  addTeacher,
  getStudents,
  getSubjects,
  getTeachers
};
