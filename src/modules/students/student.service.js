const Student = require("./student.model");
const Grade = require("../grades/grade.model");
const Bulletin = require("../bulletins/bulletin.model");

// Créer un élève
const createStudent = async (data) => {
  return await Student.create(data);
};

// Modifier un élève
const updateStudent = async (id, data) => {
  const student = await Student.findById(id);
  if (!student) throw new Error("Student not found");

  Object.assign(student, data);
  return await student.save();
};

// Lister élèves d’une classe
const getStudentsByClass = async (classId) => {
  return await Student.find({ class: classId, isActive: true })
    .populate("class")
    .sort({ lastName: 1 });
};

// Rattacher un parent à un élève
const addParentToStudent = async (studentId, parentId) => {
  return await Student.findByIdAndUpdate(
    studentId,
    { $addToSet: { parents: parentId } },
    { new: true }
  );
};

// Changer de classe (fin d’année)
const changeStudentClass = async (studentId, newClassId) => {
  const student = await Student.findById(studentId);
  if (!student) throw new Error("Student not found");

  student.class = newClassId;
  return await student.save();
};

// Désactiver un élève (soft delete)
const deactivateStudent = async (studentId) => {
  const hasHistory =
    (await Grade.exists({ student: studentId })) ||
    (await Bulletin.exists({ student: studentId }));

  if (hasHistory) {
    throw new Error("Student has academic history");
  }

  return await Student.findByIdAndUpdate(
    studentId,
    { isActive: false },
    { new: true }
  );
};

// Élèves visibles par un parent
const getStudentsByParent = async (parentId) => {
  return await Student.find({
    parents: parentId,
    isActive: true
  }).populate("class");
};

module.exports = {
  createStudent,
  updateStudent,
  getStudentsByClass,
  addParentToStudent,
  changeStudentClass,
  deactivateStudent,
  getStudentsByParent
};
