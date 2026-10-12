const express = require("express");
const Controller = require("./teacherAssignment.controller");
const { protect } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const { spreadsheetUpload } = require("../../utils/upload");

const router = express.Router();

router.use(protect);

router.post("/", authorize("admin"), Controller.assign);
router.get("/", authorize("admin", "secretary"), Controller.getAll);
router.post("/import-excel", authorize("admin", "secretary"), spreadsheetUpload.single("file"), Controller.importExcel);
router.delete("/:id", authorize("admin"), Controller.unassign);
router.get("/me", authorize("teacher"), Controller.myClasses);
router.get("/dashboard", authorize("teacher"), Controller.dashboard);
// Enseignant : uniquement ses propres affectations dans la classe
router.get("/class/:classId", authorize("admin", "teacher"), Controller.classSubjects);

module.exports = router;
