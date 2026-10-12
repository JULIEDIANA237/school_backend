const Service = require("./teacherAssignment.service");
const mongoose = require("mongoose");
const { sendError } = require("../../utils/httpError");

const handle = (fn, successStatus = 200) => async (req, res) => {
  try {
    res.status(successStatus).json(await fn(req));
  } catch (error) {
    sendError(res, error);
  }
};

const TeacherAssignmentController = {
  assign: handle((req) => Service.assign(req.body || {}), 201),

  unassign: handle(async (req) => {
    await Service.removeAssignment(req.params.id);
    return { message: "Affectation supprimée" };
  }),

  async myClasses(req, res) {
    const { schoolYearId } = req.query;
    if (schoolYearId !== undefined && (typeof schoolYearId !== "string" || !mongoose.Types.ObjectId.isValid(schoolYearId))) {
      return res.status(400).json({ error: "Identifiant d’année scolaire invalide" });
    }
    try {
      res.json(await Service.getTeacherClasses(req.user.id, schoolYearId));
    } catch (error) {
      sendError(res, error);
    }
  },

  async dashboard(req, res) {
    const { schoolYearId } = req.query;
    if (schoolYearId !== undefined && (typeof schoolYearId !== "string" || !mongoose.Types.ObjectId.isValid(schoolYearId))) {
      return res.status(400).json({ error: "Identifiant d’année scolaire invalide" });
    }
    try {
      res.json(await Service.getTeacherDashboard(req.user.id, schoolYearId));
    } catch (error) {
      sendError(res, error);
    }
  },

  classSubjects: handle((req) =>
    Service.getClassSubjects(req.params.classId, req.user.role === "teacher" ? req.user.id : null),
  ),

  getAll: handle((req) => Service.getAssignments(req.query)),

  async importExcel(req, res) {
    try {
      if (!req.file) return res.status(400).json({ error: "Aucun fichier fourni." });
      res.status(200).json(await Service.importAssignmentsFromExcel(req.file.buffer, req.body?.schoolYearId));
    } catch (error) {
      sendError(res, error);
    }
  },
};

module.exports = TeacherAssignmentController;
