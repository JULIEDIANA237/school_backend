const GradeService = require("./grade.service");

const GradeController = {
  async upsert(req, res) {

    console.log("========== UPSERT GRADE ==========");

    try {

      console.log("User reçu du middleware :", req.user);

      const teacherId = req.user?.id;

      console.log("TeacherId extrait :", teacherId);

      const { studentId, evaluationId, score } = req.body;

      console.log("Body reçu :", req.body);

      if (!teacherId) {
        console.log("❌ Aucun teacherId dans req.user");
        return res.status(403).json({
          error: "Utilisateur non authentifié"
        });
      }

      console.log("Appel du service GradeService.upsertGrade");

      const grade = await GradeService.upsertGrade({
        studentId,
        evaluationId,
        score,
        teacherId
      });

      console.log("✅ Note enregistrée :", grade);

      res.status(200).json({
        message: "Note enregistrée",
        data: grade
      });

    } catch (error) {

      console.log("❌ ERREUR DANS CONTROLLER");

      console.error(error);

      res.status(400).json({
        error: error.message
      });

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
      await GradeService.deleteGrade(req.params.gradeId, req.user.id);
      res.status(200).json({ message: "Note supprimée" });
    } catch (error) {
      res.status(404).json({ error: error.message });
    }
  },

  async getStudentAverages(req, res) {
    try {
      const { studentId, classId, periodId } = req.params;
      const averages = await GradeService.getStudentAverages(studentId, classId, periodId);
      res.status(200).json(averages);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async getClassAverages(req, res) {
    try {
      const { classId, periodId } = req.params;
      const averages = await GradeService.getClassAverages(classId, periodId);
      res.status(200).json(averages);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async getSubjectAveragesForClass(req, res) {
    try {
      const { classId, subjectId, periodId } = req.params;
      const averages = await GradeService.getSubjectAveragesForClass(classId, subjectId, periodId);
      res.status(200).json(averages);
    } catch (error) {
      console.error("❌ [GradeController] getSubjectAveragesForClass error:", error.message);
      res.status(400).json({ error: error.message });
    }
  },

  async getGradesByClass(req, res) {
    try {
      const { classId } = req.params;
      const { periodId, subjectId } = req.query;
      const data = await GradeService.getGradesByClass(classId, { periodId, subjectId });
      res.status(200).json(data);
    } catch (error) {
      console.error("❌ [GradeController] getGradesByClass error:", error.message);
      res.status(400).json({ error: error.message });
    }
  }
};

module.exports = GradeController;
