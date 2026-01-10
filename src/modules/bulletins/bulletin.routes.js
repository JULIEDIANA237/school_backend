const express = require("express");
const BulletinController = require("./bulletin.controller");
const { protect } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");

const router = express.Router();

// créer ou mettre à jour un bulletin
router.post(
  "/",
  protect,
  authorize(["teacher", "admin"]),
  BulletinController.createOrUpdate
);

// lister les bulletins d'une classe
router.get(
  "/class/:classId/period/:periodId",
  protect,
  authorize(["teacher", "admin"]),
  BulletinController.getByClass
);

// publier un bulletin
router.patch(
  "/publish/:bulletinId",
  protect,
  authorize(["teacher", "admin"]),
  BulletinController.publish
);

// bulletins publiés pour parents
router.get(
  "/parent",
  protect,
  authorize(["parent"]),
  BulletinController.getPublishedForParent
);


module.exports = router;
