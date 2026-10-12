const express = require("express");
const router = express.Router();
const evalController = require("./evaluation.controller");
const { protect } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");

const teacher = authorize("teacher");

router.use(protect);

// Création : l'enseignant doit être affecté à la classe et à la matière
router.post("/", teacher, evalController.createEvaluation);

// Liste par classe (+ ?periodId=) ; un enseignant ne voit que ses évaluations
router.get("/class/:classId", authorize("teacher", "admin", "secretary"), evalController.listEvaluations);

// Actions réservées à l'enseignant auteur (vérifié dans le service)
router.put("/:id", teacher, evalController.updateEvaluation);
router.patch("/:id/publish", teacher, evalController.publishEvaluation);
router.patch("/:id/unpublish", teacher, evalController.unpublishEvaluation);
router.post("/bulk-unpublish", teacher, evalController.bulkUnpublish);
router.delete("/:id", teacher, evalController.deleteEvaluation);

module.exports = router;
