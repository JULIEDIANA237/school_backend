const GradeService = require("./grade.service");

const GradeController = {
  async upsert(req, res) {
    try {
      const grade = await GradeService.upsertGrade(req.body);
      res.status(200).json({ message: "Note enregistrée", data: grade });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async getByStudent(req, res) {
    try {
      const { studentId, periodId } = req.params;
      const grades = await GradeService.getGradesByStudent(studentId, periodId);
      res.status(200).json(grades);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async remove(req, res) {
    try {
      await GradeService.deleteGrade(req.params.gradeId);
      res.status(200).json({ message: "Note supprimée" });
    } catch (error) {
      res.status(404).json({ error: error.message });
    }
  }
};

module.exports = GradeController;
