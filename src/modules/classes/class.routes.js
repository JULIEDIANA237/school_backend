const express = require("express");
const { protect } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const controller = require("./class.controller");

const router = express.Router();

router.use(protect); // 🔐 Auth obligatoire

// Classes
router.post("/", authorize("admin"), controller.create);
router.get("/", authorize("admin", "teacher"), controller.getAll);
router.get("/:id", authorize("admin", "teacher"), controller.details);

// Relations
router.post(
  "/:classId/student/:studentId",
  authorize("admin"),
  controller.addStudent
);

router.post(
  "/:classId/subject/:subjectId",
  authorize("admin"),
  controller.addSubject
);

router.post(
  "/:classId/teacher/:teacherId",
  authorize("admin"),
  controller.addTeacher
);

// Récupérations ciblées
router.get(
  "/:id/students",
  authorize("admin", "teacher"),
  controller.getStudents
);

router.get(
  "/:id/subjects",
  authorize("admin", "teacher"),
  controller.getSubjects
);

router.get(
  "/:id/teachers",
  authorize("admin", "teacher"),
  controller.getTeachers
);

module.exports = router;
