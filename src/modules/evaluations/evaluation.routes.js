const express = require("express");
const router = express.Router();
const evalController = require("./evaluation.controller");
const { protect } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");

// Créer une évaluation (Admin / Teacher)
router.post("/", protect, authorize("admin", "teacher"), evalController.createEvaluation);

// Lister les évaluations d'une classe
// routes/evaluations.routes.js
router.get("/:classId", protect, (req, res, next) => {
  console.log("🧭 ROUTE /evaluations/:classId");
  console.log("➡️ req.params =", req.params);
  console.log("➡️ req.query =", req.query);
  next();
}, evalController.listEvaluations);


// Publier une évaluation
router.patch("/:id/publish", protect, authorize("teacher"), evalController.publishEvaluation);

// Ajouter une note à une évaluation
router.post("/:id/grade", protect, authorize("teacher"), evalController.addGrade);

module.exports = router;
