const express = require("express");
const multer = require("multer");
const { protect } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const controller = require("./class.controller");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(protect);

// Classes
router.post("/", authorize("admin", "secretary"), controller.create);
router.post("/import", authorize("admin", "secretary"), upload.single("file"), controller.importClasses);
router.put("/:id", authorize("admin", "secretary"), controller.update);
router.delete("/:id", authorize("admin", "secretary"), controller.remove);
router.get("/", authorize("admin", "secretary", "teacher"), controller.getAll);
router.get("/:id", authorize("admin", "secretary", "teacher"), controller.details);

// Relations
router.post(
  "/:classId/student/:studentId",
  authorize("admin", "secretary"),
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
