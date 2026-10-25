const StudentService = require("./student.service");
const { sendError } = require("../../utils/httpError");
const { assertClassAccess } = require("../../utils/access");

const handle = (fn, successStatus = 200) => async (req, res) => {
  try {
    res.status(successStatus).json(await fn(req));
  } catch (error) {
    sendError(res, error);
  }
};

const StudentController = {
  create: handle((req) => StudentService.createStudent(req.body || {}), 201),

  update: handle((req) => StudentService.updateStudent(req.params.id, req.body || {})),

  byClass: handle(async (req) => {
    await assertClassAccess(req.user, req.params.classId);
    return StudentService.getStudentsByClass(req.params.classId);
  }),

  addParent: handle((req) => StudentService.addParentToStudent(req.params.studentId, req.body?.parentId)),

  changeClass: handle((req) => StudentService.changeStudentClass(req.params.studentId, req.body?.classId)),

  byParent: handle((req) => StudentService.getStudentsByParent(req.user.id)),

  getMe: handle((req) => StudentService.getStudentByUserId(req.user.id)),

  deactivate: handle((req) => StudentService.deactivateStudent(req.params.studentId)),

  getAll: handle((req) => StudentService.getAllStudents(req.query.schoolYearId)),

  async importExcel(req, res) {
    try {
      if (!req.file) return res.status(400).json({ error: "Aucun fichier fourni." });
      const { classId, schoolYearId } = req.body || {};
      const result = await StudentService.importStudentsFromExcel(
        req.file.buffer,
        classId,
        schoolYearId || req.query.schoolYearId,
      );
      res.status(200).json(result);
    } catch (error) {
      sendError(res, error);
    }
  },
};

module.exports = StudentController;
