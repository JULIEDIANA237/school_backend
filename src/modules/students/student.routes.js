const express = require("express");
const StudentController = require("./student.controller");
const { protect } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const { spreadsheetUpload } = require("../../utils/upload");

const router = express.Router();
const staff = authorize("admin", "secretary");

router.use(protect);

router.post("/", staff, StudentController.create);
router.post("/import", staff, spreadsheetUpload.single("file"), StudentController.importExcel);
router.get("/", staff, StudentController.getAll);
router.put("/:id", staff, StudentController.update);

// Enseignant : uniquement ses classes (vérifié dans le contrôleur)
router.get("/class/:classId", authorize("admin", "secretary", "teacher"), StudentController.byClass);
router.get("/parent/me", authorize("parent"), StudentController.byParent);

router.post("/:studentId/parent", staff, StudentController.addParent);
router.patch("/:studentId/class", staff, StudentController.changeClass);
router.patch("/deactivate/:studentId", staff, StudentController.deactivate);

module.exports = router;
