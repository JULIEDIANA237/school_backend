const express = require("express");
const BulletinController = require("./bulletin.controller");
const { protect } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const { requireClassAccess } = require("../../utils/access");
const { createLimiter } = require("../../utils/rateLimit");

const router = express.Router();
const staff = authorize("admin", "secretary");

// Vérification publique (QR code imprimé sur le bulletin)
router.get(
  "/verify/:bulletinId/:code",
  createLimiter({ name: "bulletin-verify", windowMs: 15 * 60 * 1000, limit: 60 }),
  BulletinController.verify,
);

router.use(protect);

router.get("/", staff, BulletinController.getAll);
router.post("/", staff, BulletinController.createOrUpdate);
router.post("/generate", staff, BulletinController.generateForClass);
router.post("/bulk-publish", authorize("admin", "teacher", "secretary"), BulletinController.bulkPublish);
router.post("/bulk-unpublish", staff, BulletinController.bulkUnpublish);

router.get("/parent", authorize("parent"), BulletinController.getPublishedForParent);
router.get(
  "/class/:classId/period/:periodId",
  authorize("teacher", "admin", "secretary"),
  requireClassAccess("classId"),
  BulletinController.getByClass,
);

router.get("/:bulletinId", authorize("admin", "secretary", "teacher", "parent"), BulletinController.getById);
router.patch("/:bulletinId", authorize("teacher", "admin", "secretary"), BulletinController.updateDetails);
router.patch("/:bulletinId/publish", authorize("teacher", "admin", "secretary"), BulletinController.publish);
router.patch("/:bulletinId/unpublish", staff, BulletinController.unpublish);

module.exports = router;
