const service = require("./class.service");
const { sendError } = require("../../utils/httpError");

const handle = (fn, successStatus = 200) => async (req, res) => {
  try {
    res.status(successStatus).json(await fn(req));
  } catch (error) {
    sendError(res, error);
  }
};

module.exports = {
  create: handle((req) => service.createClass(req.body || {}), 201),
  getAll: handle((req) => service.getAllClasses(req.query.schoolYearId, req.user)),
  details: handle((req) => service.getClassDetails(req.params.id)),
  update: handle((req) => service.updateClass(req.params.id, req.body || {})),
  remove: handle((req) => service.deleteClass(req.params.id)),
  importClasses: async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Fichier requis" });
    try {
      res.json(await service.importClassesFromExcel(req.file.buffer, req.body?.schoolYearId));
    } catch (error) {
      sendError(res, error);
    }
  },
  addStudent: handle((req) => service.addStudentToClass(req.params.classId, req.params.studentId)),
  addTeacher: handle((req) => service.addTeacherToClass(req.params.classId, req.params.teacherId)),
  getStudents: handle((req) => service.getClassStudents(req.params.id)),
  getSubjects: handle((req) => service.getClassSubjects(req.params.id)),
  getTeachers: handle((req) => service.getClassTeachers(req.params.id)),
};
