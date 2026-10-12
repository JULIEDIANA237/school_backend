const express = require("express");
const { protect } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const { requireClassAccess } = require("../../utils/access");
const { spreadsheetUpload } = require("../../utils/upload");
const controller = require("./class.controller");

const router = express.Router();
const staff = authorize("admin", "secretary");
const readers = authorize("admin", "secretary", "teacher");

router.use(protect);

// Classes
router.post("/", staff, controller.create);
router.post("/import", staff, spreadsheetUpload.single("file"), controller.importClasses);
router.put("/:id", staff, controller.update);
router.delete("/:id", staff, controller.remove);
// Un enseignant ne reçoit que ses classes
router.get("/", readers, controller.getAll);
router.get("/:id", readers, requireClassAccess("id"), controller.details);

// Relations
router.post("/:classId/student/:studentId", staff, controller.addStudent);
router.post("/:classId/teacher/:teacherId", authorize("admin"), controller.addTeacher);

// Récupérations ciblées (enseignant : uniquement ses classes)
router.get("/:id/students", readers, requireClassAccess("id"), controller.getStudents);
router.get("/:id/subjects", readers, requireClassAccess("id"), controller.getSubjects);
router.get("/:id/teachers", readers, requireClassAccess("id"), controller.getTeachers);

module.exports = router;
