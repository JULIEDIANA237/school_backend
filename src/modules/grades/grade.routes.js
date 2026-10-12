const express = require("express");
const GradeController = require("./grade.controller");
const { protect } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");

const router = express.Router();
const readers = authorize("teacher", "admin", "secretary");

// Les contrôles fins (affectation, propriété, filiation) sont faits dans le service.
router.use(protect);

// Créer ou modifier une note
router.post("/", authorize("teacher", "admin"), GradeController.upsert);

// Notes d'un élève pour une période
router.get("/student/:studentId/period/:periodId", readers, GradeController.getByStudent);

// Supprimer une note
router.delete("/:gradeId", authorize("teacher", "admin"), GradeController.remove);

// Moyennes calculées à la volée (aucune écriture). Les parents consultent uniquement les bulletins publiés.
router.get(
  "/averages/student/:studentId/class/:classId/period/:periodId",
  readers,
  GradeController.getStudentAverages,
);
router.get("/averages/class/:classId/period/:periodId", readers, GradeController.getClassAverages);
router.get(
  "/averages/subject/:subjectId/class/:classId/period/:periodId",
  readers,
  GradeController.getSubjectAveragesForClass,
);

// Grille de saisie : ?periodId=...&subjectId=...
router.get("/class/:classId", readers, GradeController.getGradesByClass);

module.exports = router;
