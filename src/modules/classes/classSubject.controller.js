const ClassSubjectService = require("./classSubject.service");
const { sendError } = require("../../utils/httpError");

const ClassSubjectController = {
  async importCoefficients(req, res) {
    try {
      if (!req.file) return res.status(400).json({ error: "Aucun fichier fourni." });
      const result = await ClassSubjectService.importCoefficientsFromExcel(req.file.buffer, req.body?.schoolYearId);
      res.status(200).json(result);
    } catch (error) {
      sendError(res, error);
    }
  },

  async getByClass(req, res) {
    try {
      res.json(await ClassSubjectService.getClassSubjects(req.params.classId, req.query.schoolYearId));
    } catch (error) {
      sendError(res, error);
    }
  },

  async assign(req, res) {
    try {
      res.json(await ClassSubjectService.assignSubjectToClass(req.body || {}));
    } catch (error) {
      sendError(res, error);
    }
  },
};

module.exports = ClassSubjectController;
