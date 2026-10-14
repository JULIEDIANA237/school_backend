const express = require("express");
const controller = require("./vieScolaire.controller");
const { protect } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const { requireVieScolaire } = require("../../utils/access");
const { createLimiter } = require("../../utils/rateLimit");

const router = express.Router();
const staffOrTeacher = authorize("teacher", "admin", "secretary", "supervisor");

router.use(protect);

// Appel : l'enseignant pour ses classes, le surveillant général pour les siennes ; pas l'administrateur (vérifié dans le service)
router.get("/roster", staffOrTeacher, controller.roster);
router.post("/sessions", staffOrTeacher, controller.saveSession);
router.get("/sessions/mine", staffOrTeacher, controller.mySessions);

// Espace parent
router.get("/parent/overview", authorize("parent"), controller.parentOverview);
router.post(
  "/records/:id/justification",
  authorize("parent"),
  createLimiter({ name: "justification", windowMs: 60 * 60 * 1000, limit: 30 }),
  controller.submitJustification,
);

// Pièce jointe d'un justificatif : parents de l'élève et vie scolaire (vérifié dans le service)
router.get("/files/:id", authorize("parent", "admin", "teacher", "secretary", "supervisor"), controller.getFile);

// Fiche élève : vie scolaire, personnel, enseignant de la classe, parents (vérifié dans le service)
router.get("/students/:studentId/summary", controller.studentSummary);

// Consultation : l'administrateur (tout l'établissement) et le surveillant général (ses classes).
// Saisie (absences, justificatifs, sanctions) : le surveillant général de la classe seulement (vérifié dans le service)
router.get("/classes", requireVieScolaire, controller.classes);
router.get("/dashboard", requireVieScolaire, controller.dashboard);
router.get("/records", requireVieScolaire, controller.listRecords);
router.post("/records", requireVieScolaire, controller.createRecord);
router.patch("/records/:id", requireVieScolaire, controller.updateRecord);
router.delete("/records/:id", requireVieScolaire, controller.deleteRecord);
router.post("/records/:id/review", requireVieScolaire, controller.reviewJustification);
router.get("/incidents", requireVieScolaire, controller.listIncidents);
router.post("/incidents", requireVieScolaire, controller.createIncident);
router.delete("/incidents/:id", requireVieScolaire, controller.deleteIncident);
router.get("/settings", requireVieScolaire, controller.getSettings);
// Règlement intérieur : l'administrateur seul le modifie
router.put("/settings", authorize("admin"), controller.updateSettings);

// Surveillants généraux : l'administrateur désigne les classes de chacun
router.get("/supervisors", authorize("admin"), controller.listSupervisors);
router.put("/supervisors/:userId", authorize("admin"), controller.setSupervisedClasses);

module.exports = router;
