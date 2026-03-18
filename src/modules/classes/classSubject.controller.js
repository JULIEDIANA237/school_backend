const ClassSubjectService = require("./classSubject.service");

const ClassSubjectController = {
  async importCoefficients(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Aucun fichier fourni." });
      }
      const result = await ClassSubjectService.importCoefficientsFromExcel(req.file.buffer);
      res.status(200).json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async getByClass(req, res) {
    try {
      const { schoolYearId } = req.query;
      const subjects = await ClassSubjectService.getClassSubjects(req.params.classId, schoolYearId);
      res.json(subjects);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async assign(req, res) {
    try {
      const assignment = await ClassSubjectService.assignSubjectToClass(req.body);
      res.json(assignment);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
};

module.exports = ClassSubjectController;
