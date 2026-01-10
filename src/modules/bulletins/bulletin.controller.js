const BulletinService = require("./bulletin.service");

const BulletinController = {
  // Créer ou mettre à jour un bulletin
  async createOrUpdate(req, res) {
    try {
      const { studentId, classId, periodId } = req.body;
      const bulletin = await BulletinService.calculateBulletin(studentId, classId, periodId);
      res.status(200).json({ message: "Bulletin généré", data: bulletin });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Erreur lors de la création du bulletin" });
    }
  },

  // Récupérer tous les bulletins d'une classe pour une période
  async getByClass(req, res) {
    try {
      const { classId, periodId } = req.params;
      const bulletins = await BulletinService.getBulletinsByClass(classId, periodId);
      res.status(200).json(bulletins);
    } catch (error) {
      res.status(500).json({ error: "Erreur lors de la récupération des bulletins" });
    }
  },

  // Publier un bulletin
  async publish(req, res) {
    try {
      const { bulletinId } = req.params;
      const bulletin = await BulletinService.publishBulletin(bulletinId);
      res.status(200).json({ message: "Bulletin publié", data: bulletin });
    } catch (error) {
      res.status(500).json({ error: "Erreur lors de la publication du bulletin" });
    }
  },

  // Récupérer les bulletins publiés pour les parents
  async getPublishedForParent(req, res) {
    try {
      const parentId = req.user.id; // récupéré depuis le JWT
      const { periodId } = req.query; // optionnel

      const bulletins = await BulletinService.getPublishedByParent(parentId, periodId);
      res.status(200).json(bulletins);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Erreur lors de la récupération des bulletins publiés" });
    }
  }
};

module.exports = BulletinController;
