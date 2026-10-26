const express = require("express");
const controller = require("./geoAttendance.controller");
const { protect } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");

const router = express.Router();

router.use(protect);

// Mode A : Borne Kiosk de l'école (accessible admin, censeur ou écran public d'accueil)
router.get("/kiosk-qr", authorize("admin", "censeur", "secretary", "supervisor"), controller.getKioskQr);
router.post("/kiosk-qr/rotate", authorize("admin", "censeur", "secretary", "supervisor"), controller.rotateKioskQr);

// Mode B : Badge Mobile enseignant (l'enseignant génère son badge tournant)
router.get("/teacher-badge-qr", authorize("teacher", "admin"), controller.getTeacherBadge);

// Pointage officiel (Arrivée ou Départ) : Enseignant (Mode A) ou Surveillant/Vigile (Mode B)
router.post("/checkin", authorize("teacher", "admin", "supervisor", "secretary", "censeur"), controller.checkInOut);

// Registre de présence en temps réel : Administration et Censeur
router.get("/today", authorize("admin", "censeur", "secretary", "supervisor"), controller.getTodayRegister);

// Mon historique de pointage : Enseignant
router.get("/mine", authorize("teacher", "admin"), controller.getMyHistory);

module.exports = router;
