const express = require("express");
const GradeController = require("./grade.controller");
const { protect } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");

const router = express.Router();

// Créer ou modifier une note
router.post(
  "/",
  protect,
  authorize("teacher", "admin"),
  GradeController.upsert
);

// Notes d'un élève pour une période
router.get(
  "/student/:studentId/period/:periodId",
  protect,
  authorize("teacher", "admin"),
  GradeController.getByStudent
);

// Supprimer une note
router.delete(
  "/:gradeId",
  protect,
  authorize("teacher", "admin"),
  GradeController.remove
);

// Obtenir les moyennes d'un élève par matière et générale
router.get(
  "/averages/student/:studentId/class/:classId/period/:periodId",
  protect,
  authorize("teacher", "admin", "parent"),
  GradeController.getStudentAverages
);

// Obtenir les moyennes de la classe par matière et générale
router.get(
  "/averages/class/:classId/period/:periodId",
  protect,
  authorize("teacher", "admin"),
  GradeController.getClassAverages
);

// Obtenir les moyennes de la classe pour une matière spécifique (vue prof)
router.get(
  "/averages/subject/:subjectId/class/:classId/period/:periodId",
  protect,
  authorize("teacher", "admin"),
  GradeController.getSubjectAveragesForClass
);

// Obtenir toutes les notes d'une classe (pour la grille de saisie)
// Supporte les query params: ?periodId=...&subjectId=...
router.get(
  "/class/:classId",
  protect,
  authorize("teacher", "admin"),
  GradeController.getGradesByClass
);

module.exports = router;
