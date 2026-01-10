const express = require("express");
const GradeController = require("./grade.controller");
const { protect } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");

const router = express.Router();

// Créer ou modifier une note
router.post(
  "/",
  protect,
  authorize(["teacher", "admin"]),
  GradeController.upsert
);

// Notes d'un élève pour une période
router.get(
  "/student/:studentId/period/:periodId",
  protect,
  authorize(["teacher", "admin"]),
  GradeController.getByStudent
);

// Supprimer une note
router.delete(
  "/:gradeId",
  protect,
  authorize(["teacher", "admin"]),
  GradeController.remove
);

module.exports = router;
