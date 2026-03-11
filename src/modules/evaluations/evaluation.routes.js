const express = require("express");
const router = express.Router();
const evalController = require("./evaluation.controller");
const { protect } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");

/* ============================
   ➕ CRÉATION
   Admin / Teacher
============================ */
router.post(
  "/",
  protect,
  authorize("admin", "teacher"),
  evalController.createEvaluation
);

/* ============================
   📋 LISTE DES ÉVALUATIONS
   Par classe (+ période optionnelle)
   GET /evaluations/class/:classId?periodId=xxx
============================ */
router.get(
  "/class/:classId",
  protect,
  (req, res, next) => {
    console.log("🧭 ROUTE GET /evaluations/class/:classId");
    console.log("➡️ params =", req.params);
    console.log("➡️ query =", req.query);
    next();
  },
  evalController.listEvaluations
);

/* ============================
   ✏️ ÉDITION D’UNE ÉVALUATION
   Teacher uniquement (créateur)
============================ */
router.put(
  "/:id",
  protect,
  authorize("teacher"),
  evalController.updateEvaluation
);

/* ============================
   📢 PUBLICATION
   Teacher uniquement
============================ */
router.patch(
  "/:id/publish",
  protect,
  authorize("teacher"),
  evalController.publishEvaluation
);

router.patch(
  "/:id/unpublish",
  protect,
  authorize("teacher"),
  evalController.unpublishEvaluation
);

router.post(
  "/bulk-unpublish",
  protect,
  authorize("teacher"),
  evalController.bulkUnpublish
);

/* ============================
   ➕ AJOUT DE NOTE
   Teacher uniquement
============================ */
router.post(
  "/:id/grades",
  protect,
  authorize("teacher"),
  evalController.addGrade
);

/* ============================
   🗑️ SUPPRESSION
   Teacher uniquement
============================ */
router.delete(
  "/:id",
  protect,
  authorize("teacher"),
  evalController.deleteEvaluation
);

module.exports = router;
