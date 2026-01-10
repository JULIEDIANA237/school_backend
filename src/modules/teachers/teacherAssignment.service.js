const TeacherAssignment = require("./teacherClassSubject.model");
const Evaluation = require("../evaluations/evaluation.model");

// Affecter un enseignant
const assignTeacher = async ({ teacher, classId, subject }) => {
  return await TeacherAssignment.create({
    teacher,
    class: classId,
    subject
  });
};

// Désaffecter (si aucune évaluation)
const unassignTeacher = async (assignmentId) => {
  const used = await Evaluation.exists({
    assignment: assignmentId
  });

  if (used) {
    throw new Error("Assignment already used in evaluations");
  }

  return await TeacherAssignment.findByIdAndDelete(assignmentId);
};

// Classes enseignées par un prof
const getTeacherClasses = async (teacherId) => {
  return await TeacherAssignment.find({ teacher: teacherId })
    .populate("class subject")
    .sort({ "class.name": 1 });
};

// Matières enseignées dans une classe
const getClassSubjects = async (classId) => {
  return await TeacherAssignment.find({ class: classId })
    .populate("teacher subject");
};

// Vérification métier clé
const isTeacherAssigned = async (teacherId, classId, subjectId) => {
  return await TeacherAssignment.exists({
    teacher: teacherId,
    class: classId,
    subject: subjectId
  });
};

module.exports = {
  assignTeacher,
  unassignTeacher,
  getTeacherClasses,
  getClassSubjects,
  isTeacherAssigned
};
