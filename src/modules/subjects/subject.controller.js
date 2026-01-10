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

  async list(req, res) {
    console.log("[CONTROLLER] Récupération des sujets actifs");

    try {
      const subjects = await SubjectService.getActiveSubjects();
      res.json(subjects);
    } catch (error) {
      console.error("[CONTROLLER] Erreur liste sujets :", error.message);
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
