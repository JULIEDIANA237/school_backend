const express = require("express");
const ScheduleController = require("./schedule.controller");
const { protect } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const { requireCenseur } = require("../../utils/access");

const router = express.Router();

router.use(protect);

// -------------------------------------------------------------
// Salles (Rooms)
// -------------------------------------------------------------
router.get("/rooms", ScheduleController.getRooms);
router.post("/rooms", authorize("admin", "secretary", "censeur"), ScheduleController.createRoom);
router.put("/rooms/:id", authorize("admin", "secretary", "censeur"), ScheduleController.updateRoom);
router.delete("/rooms/:id", authorize("admin", "secretary", "censeur"), ScheduleController.deleteRoom);

// -------------------------------------------------------------
// Créneaux horaires types (TimeSlots)
// -------------------------------------------------------------
router.get("/time-slots", ScheduleController.getTimeSlots);
router.post("/time-slots", authorize("admin", "secretary", "censeur"), ScheduleController.createTimeSlot);
router.put("/time-slots/:id", authorize("admin", "secretary", "censeur"), ScheduleController.updateTimeSlot);
router.delete("/time-slots/:id", authorize("admin", "secretary", "censeur"), ScheduleController.deleteTimeSlot);

// -------------------------------------------------------------
// Emploi du temps - Vues & Quotas
// -------------------------------------------------------------
router.get("/class/:classId", ScheduleController.getByClass);
router.get("/teacher/:teacherId", ScheduleController.getByTeacher);
router.get("/room/:roomId", ScheduleController.getByRoom);
router.get("/quota-summary/:classId", ScheduleController.getQuotaSummary);

// -------------------------------------------------------------
// Emploi du temps - Gestion des créneaux
// -------------------------------------------------------------
router.post("/entries", authorize("admin", "secretary", "censeur"), ScheduleController.createEntry);
router.put("/entries/:id", authorize("admin", "secretary", "censeur"), ScheduleController.updateEntry);
router.delete("/entries/:id", authorize("admin", "secretary", "censeur"), ScheduleController.deleteEntry);

// -------------------------------------------------------------
// Cahier de textes (LessonLog) & Devoirs
// -------------------------------------------------------------
router.get("/lesson-logs/class/:classId", ScheduleController.getLogsByClass);
router.get("/lesson-logs/homework", ScheduleController.getUpcomingHomework);
router.get("/lesson-logs/today", authorize("teacher", "admin", "censeur"), ScheduleController.getTodayTeacherSessions);

router.post("/lesson-logs", authorize("teacher", "admin", "censeur"), ScheduleController.createLessonLog);
router.put("/lesson-logs/:id", authorize("teacher", "admin", "censeur"), ScheduleController.updateLessonLog);
router.delete("/lesson-logs/:id", authorize("teacher", "admin", "censeur"), ScheduleController.deleteLessonLog);

// -------------------------------------------------------------
// Suivi de la progression par le Censeur
// -------------------------------------------------------------
router.get("/censeur/progression", requireCenseur, ScheduleController.getCenseurProgression);

// -------------------------------------------------------------
// Espace Élève (Student Portal)
// -------------------------------------------------------------
router.get("/student/me", authorize("student"), ScheduleController.getMyProfile);
router.get("/student/schedule", authorize("student"), ScheduleController.getMySchedule);
router.get("/student/homework", authorize("student"), ScheduleController.getMyHomework);
router.get("/student/grades", authorize("student"), ScheduleController.getMyGrades);
router.get("/student/bulletins", authorize("student"), ScheduleController.getMyBulletins);

module.exports = router;

