const StudentService = require("./student.service");

const StudentController = {
  async create(req, res) {
    try {
      const student = await StudentService.createStudent(req.body);
      res.status(201).json(student);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async update(req, res) {
    try {
      const student = await StudentService.updateStudent(req.params.id, req.body);
      res.json(student);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async byClass(req, res) {
    const students = await StudentService.getStudentsByClass(req.params.classId);
    res.json(students);
  },

  async addParent(req, res) {
    const student = await StudentService.addParentToStudent(
      req.params.studentId,
      req.body.parentId
    );
    res.json(student);
  },

  async changeClass(req, res) {
    const student = await StudentService.changeStudentClass(
      req.params.studentId,
      req.body.classId
    );
    res.json(student);
  },

  async byParent(req, res) {
    const students = await StudentService.getStudentsByParent(req.user.id);
    res.json(students);
  },

  async deactivate(req, res) {
    try {
      const student = await StudentService.deactivateStudent(req.params.studentId);
      res.json(student);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
  async getAll(req, res) {
    const students = await StudentService.getAllStudents();
    res.json(students);
  },
};

module.exports = StudentController;
