// modules/subjects/subject.controller.js
const SubjectService = require("./subject.service");
const { sendError } = require("../../utils/httpError");

const handle = (fn, successStatus = 200) => async (req, res) => {
  try {
    res.status(successStatus).json(await fn(req));
  } catch (error) {
    sendError(res, error);
  }
};

const SubjectController = {
  create: handle((req) => SubjectService.createSubject(req.body || {}), 201),
  update: handle((req) => SubjectService.updateSubject(req.params.id, req.body || {})),
  getAll: handle(() => SubjectService.getActiveSubjects()),
  disable: handle((req) => SubjectService.disableSubject(req.params.id)),
  async importExcel(req, res) {
    try {
      if (!req.file) return res.status(400).json({ error: "Aucun fichier fourni." });
      res.status(200).json(await SubjectService.importSubjectsFromExcel(req.file.buffer));
    } catch (error) {
      sendError(res, error);
    }
  },
};

module.exports = SubjectController;
