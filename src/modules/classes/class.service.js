const Class = require("./class.model");
const Student = require("../students/student.model");

/**
 * Création d'une classe
 */
const createClass = async (data) => {
  return await Class.create(data);
};

/**
 * Ajouter un élève à une classe
 */
const addStudentToClass = async (classId, studentId) => {
  const classe = await Class.findById(classId);
  if (!classe) {
    throw new Error("Classe introuvable");
  }

  if (!classe.students.includes(studentId)) {
    classe.students.push(studentId);
    await classe.save();
  }

  await Student.findByIdAndUpdate(studentId, { class: classId });

  return classe;
};

/**
 * Ajouter une matière à une classe
 */
const addSubjectToClass = async (classId, subjectId) => {
  const classe = await Class.findById(classId);
  if (!classe) {
    throw new Error("Classe introuvable");
  }

  if (!classe.subjects.includes(subjectId)) {
    classe.subjects.push(subjectId);
    await classe.save();
  }

  return classe;
};

/**
 * Ajouter un enseignant à une classe
 */
const addTeacherToClass = async (classId, teacherId) => {
  const classe = await Class.findById(classId);
  if (!classe) {
    throw new Error("Classe introuvable");
  }

  if (!classe.teachers.includes(teacherId)) {
    classe.teachers.push(teacherId);
    await classe.save();
  }

  return classe;
};

/**
 * Récupérer toutes les classes
 */
const getAllClasses = async () => {
  return await Class.find()
    .populate("students", "firstName lastName matricule")
    .populate("subjects", "name code")
    .populate("teachers", "firstName lastName email")
    .populate("principalTeacher", "firstName lastName email");
};

/**
 * Récupérer les matières d'une classe
 */
const getClassSubjects = async (classId) => {
  const classe = await Class.findById(classId).populate("subjects");
  if (!classe) {
    throw new Error("Classe introuvable");
  }

  return classe.subjects;
};

/**
 * Récupérer les enseignants d'une classe
 */
const getClassTeachers = async (classId) => {
  const classe = await Class.findById(classId).populate("teachers");
  if (!classe) {
    throw new Error("Classe introuvable");
  }

  return classe.teachers;
};

/**
 * Récupérer les élèves d'une classe
 */
const getClassStudents = async (classId) => {
  const classe = await Class.findById(classId).populate("students");
  if (!classe) {
    throw new Error("Classe introuvable");
  }

  return classe.students;
};

/**
 * Détails complets d'une classe
 */
const getClassDetails = async (classId) => {
  return await Class.findById(classId)
    .populate("students")
    .populate("subjects")
    .populate("teachers")
    .populate("principalTeacher");
};

module.exports = {
  createClass,
  addStudentToClass,
  addSubjectToClass,
  addTeacherToClass,
  getAllClasses,
  getClassSubjects,
  getClassTeachers,
  getClassStudents,
  getClassDetails
};
