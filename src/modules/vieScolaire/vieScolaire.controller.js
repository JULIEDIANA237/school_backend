const attendance = require("./attendance.service");
const discipline = require("./discipline.service");
const settingsService = require("./settings.service");
const supervisors = require("./supervisors.service");
const { sendError } = require("../../utils/httpError");

const handle = (fn, successStatus = 200) => async (req, res) => {
  try {
    res.status(successStatus).json(await fn(req));
  } catch (error) {
    sendError(res, error);
  }
};

module.exports = {
  // Appel
  classes: handle((req) => attendance.listClasses(req.user, req.query.schoolYearId)),
  roster: handle((req) => attendance.getRoster(req.user, req.query)),
  saveSession: handle((req) => attendance.saveSession(req.user, req.body || {})),
  mySessions: handle((req) => attendance.mySessions(req.user)),

  // Absences et retards
  listRecords: handle((req) => attendance.listRecords(req.user, req.query)),
  createRecord: handle((req) => attendance.createRecord(req.user, req.body || {}), 201),
  updateRecord: handle((req) => attendance.updateRecord(req.user, req.params.id, req.body || {})),
  deleteRecord: handle((req) => attendance.deleteRecord(req.user, req.params.id)),

  // Justificatifs
  submitJustification: handle((req) => attendance.submitJustification(req.user, req.params.id, req.body || {})),
  reviewJustification: handle((req) => attendance.reviewJustification(req.user, req.params.id, req.body || {})),
  async getFile(req, res) {
    try {
      const { mime, data } = await attendance.getFile(req.user, req.params.id);
      res.set({ "Content-Type": mime, "Content-Disposition": "inline", "Cache-Control": "private, max-age=300" });
      res.send(data);
    } catch (error) {
      sendError(res, error);
    }
  },

  // Sanctions
  listIncidents: handle((req) => discipline.listIncidents(req.user, req.query)),
  createIncident: handle((req) => discipline.createIncident(req.user, req.body || {}), 201),
  deleteIncident: handle((req) => discipline.deleteIncident(req.user, req.params.id)),

  // Tableaux de bord et fiches
  dashboard: handle((req) => discipline.getDashboard(req.user, req.query)),
  studentSummary: handle((req) => discipline.getStudentSummary(req.user, req.params.studentId, req.query)),
  parentOverview: handle((req) => discipline.getParentOverview(req.user)),

  // Règlement intérieur
  getSettings: handle(() => settingsService.getSettings()),
  updateSettings: handle((req) => settingsService.updateSettings(req.body || {})),

  // Surveillants généraux et classes confiées (administrateur)
  listSupervisors: handle((req) => supervisors.listSupervisors(req.query.schoolYearId)),
  setSupervisedClasses: handle((req) => supervisors.setSupervisedClasses(req.params.userId, req.body || {})),
};
