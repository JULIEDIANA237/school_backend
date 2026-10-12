const GradeService = require("./grade.service");
const { sendError } = require("../../utils/httpError");

const handle = (fn, successStatus = 200) => async (req, res) => {
  try {
    res.status(successStatus).json(await fn(req));
  } catch (error) {
    sendError(res, error);
  }
};

const GradeController = {
  upsert: handle(async (req) => {
    const { studentId, evaluationId, score, comment } = req.body || {};
    const grade = await GradeService.upsertGrade({ studentId, evaluationId, score, comment, user: req.user });
    return { message: "Note enregistrée", data: grade };
  }),

  getByStudent: handle((req) =>
    GradeService.getGradesByStudent(req.params.studentId, req.params.periodId, req.user),
  ),

  remove: handle(async (req) => {
    await GradeService.deleteGrade(req.params.gradeId, req.user);
    return { message: "Note supprimée" };
  }),

  getStudentAverages: handle((req) => {
    const { studentId, classId, periodId } = req.params;
    return GradeService.getStudentAverages(studentId, classId, periodId, req.user);
  }),

  getClassAverages: handle((req) =>
    GradeService.getClassAverages(req.params.classId, req.params.periodId, req.user),
  ),

  getSubjectAveragesForClass: handle((req) => {
    const { classId, subjectId, periodId } = req.params;
    return GradeService.getSubjectAveragesForClass(classId, subjectId, periodId, req.user);
  }),

  getGradesByClass: handle((req) => {
    const { periodId, subjectId } = req.query;
    return GradeService.getGradesByClass(req.params.classId, { periodId, subjectId }, req.user);
  }),
};

module.exports = GradeController;
