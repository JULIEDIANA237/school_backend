const express = require("express");
const BulletinController = require("./bulletin.controller");
const { protect } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");

const router = express.Router();

// lister tous les bulletins (admin/secrétaire)
router.get(
  "/",
  protect,
  authorize("admin", "secretary"),
  BulletinController.getAll
);

// créer ou mettre à jour un bulletin
router.post(
  "/",
  protect,
  authorize("teacher", "admin"),
  BulletinController.createOrUpdate
);

// lister les bulletins d'une classe
router.get(
  "/class/:classId/period/:periodId",
  protect,
  authorize("teacher", "admin"),
  BulletinController.getByClass
);

// publier un bulletin
router.patch(
  "/:bulletinId/publish",
  protect,
  authorize("teacher", "admin", "secretary"),
  BulletinController.publish
);

// bulletins publiés pour parents
router.get(
  "/parent",
  protect,
  authorize("parent"),
  BulletinController.getPublishedForParent
);

// Récupérer un bulletin par ID
router.get(
  "/:bulletinId",
  protect,
  authorize("admin", "secretary", "teacher", "parent"),
  BulletinController.getById
);

// Mettre à jour les détails (commentaires, décisions)
router.patch(
  "/:bulletinId",
  protect,
  authorize("teacher", "admin"),
  BulletinController.updateDetails
);

// Debug: inspecter les données pour une classe (admin seulement)
router.get(
  "/debug/:classId",
  protect,
  authorize("admin"),
  async (req, res) => {
    try {
      const { classId } = req.params;
      const ClassSubject = require("../classes/classSubject.model");
      const Period = require("../periods/period.model");
      const ClassModel = require("../classes/class.model");
      const Bulletin = require("./bulletin.model");

      const classDoc = await ClassModel.findById(classId).lean();
      const classSubjectsWithYear = await ClassSubject.find({ classId, schoolYearId: classDoc?.schoolYearId })
        .populate("subjectId", "name code")
        .lean();
      const classSubjectsAny = await ClassSubject.find({ classId })
        .populate("subjectId", "name code")
        .lean();
      const periods = await Period.find({}).lean();
      const bulletinCount = await Bulletin.countDocuments({ class: classId });
      const sampleBulletin = await Bulletin.findOne({ class: classId }).lean();

      res.json({
        classDoc,
        classSubjectsWithYear: classSubjectsWithYear.length,
        classSubjectsAny: classSubjectsAny.length,
        classSubjectsAnyList: classSubjectsAny.map(cs => ({ subject: cs.subjectId?.name, coef: cs.coefficient, schoolYearId: cs.schoolYearId })),
        periods: periods.map(p => ({ id: p._id, name: p.name, type: p.type, parentPeriod: p.parentPeriod })),
        bulletinCount,
        sampleBulletinAveragesCount: sampleBulletin?.averages?.length
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Génération groupée
router.post(
  "/generate",
  protect,
  authorize("admin", "secretary"),
  BulletinController.generateForClass
);

// Publication groupée
router.post(
  "/bulk-publish",
  protect,
  authorize("admin", "teacher", "secretary"),
  BulletinController.bulkPublish
);

// Dépublier un bulletin
router.patch(
  "/:bulletinId/unpublish",
  protect,
  authorize("admin", "secretary"),
  BulletinController.unpublish
);

// Dépublication groupée
router.post(
  "/bulk-unpublish",
  protect,
  authorize("admin", "secretary"),
  BulletinController.bulkUnpublish
);



module.exports = router;
