const Service = require("./teacherAssignment.service");
const mongoose = require("mongoose");

const TeacherAssignmentController = {
  async assign(req, res) {
    try {
      const assignment = await Service.assign(req.body);
      res.status(201).json(assignment);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async unassign(req, res) {
    try {
      await Service.removeAssignment(req.params.id);
      res.json({ message: "Affectation supprimée" });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async myClasses(req, res) {
    const { schoolYearId } = req.query;
    if (schoolYearId !== undefined && (
      typeof schoolYearId !== "string" ||
      !mongoose.Types.ObjectId.isValid(schoolYearId)
    )) {
      return res.status(400).json({ error: "Identifiant d’année scolaire invalide" });
    }
    const data = await Service.getTeacherClasses(req.user.id, schoolYearId);
    res.json(data);
  },

  async classSubjects(req, res) {
    const teacherId = req.user.role === "admin" ? null : req.user.id;
    const data = await Service.getClassSubjects(req.params.classId, teacherId);
    res.json(data);
  },

  async getAll(req, res) {
    const data = await Service.getAssignments(req.query);
    res.json(data);
  },

  async importExcel(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Aucun fichier fourni." });
      }
      const result = await Service.importAssignmentsFromExcel(req.file.buffer);
      res.status(200).json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
};

module.exports = TeacherAssignmentController;
