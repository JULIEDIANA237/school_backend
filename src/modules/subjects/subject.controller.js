// modules/subjects/subject.controller.js
const SubjectService = require("./subject.service");

const SubjectController = {
  async create(req, res) {
    console.log("[CONTROLLER] Création du sujet par utilisateur :", req.user?.id, req.user?.role);

    try {
      const subject = await SubjectService.createSubject(req.body);
      res.status(201).json(subject);
    } catch (error) {
      console.error("[CONTROLLER] Erreur création sujet :", error.message);
      res.status(400).json({ error: error.message });
    }
  },

  async update(req, res) {
    console.log("[CONTROLLER] Update sujet :", req.params.id);

    try {
      const subject = await SubjectService.updateSubject(req.params.id, req.body);
      res.json(subject);
    } catch (error) {
      console.error("[CONTROLLER] Erreur update sujet :", error.message);
      res.status(400).json({ error: error.message });
    }
  },

  async getAll(req, res) {
    console.log("[CONTROLLER] Récupération des sujets actifs");

    const subjects = await SubjectService.getActiveSubjects();
    res.json(subjects);
  },

  async importExcel(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Aucun fichier fourni." });
      }
      const result = await SubjectService.importSubjectsFromExcel(req.file.buffer);
      res.status(200).json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async disable(req, res) {
    console.log("[CONTROLLER] Désactivation sujet :", req.params.id);

    try {
      const subject = await SubjectService.disableSubject(req.params.id);
      res.json(subject);
    } catch (error) {
      console.error("[CONTROLLER] Erreur désactivation sujet :", error.message);
      res.status(400).json({ error: error.message });
    }
  }
};

module.exports = SubjectController;
