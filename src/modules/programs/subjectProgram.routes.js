const express = require("express");
const controller = require("./subjectProgram.controller");
const { protect } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const { spreadsheetUpload } = require("../../utils/upload");

const router = express.Router();

router.use(protect);

// Consultation : admin, censeur, enseignant
router.get("/", authorize("admin", "censeur", "teacher", "secretary"), controller.list);
router.get("/detail/:id", authorize("admin", "censeur", "teacher", "secretary"), controller.getById);
router.get("/class/:classId/subject/:subjectId", authorize("admin", "censeur", "teacher"), controller.getForTeacher);

// Gestion proviseur / administration
router.post("/", authorize("admin", "censeur"), controller.createOrUpdate);
router.post("/import-excel", authorize("admin", "censeur"), spreadsheetUpload.single("file"), controller.importExcel);
router.delete("/:id", authorize("admin", "censeur"), controller.remove);

module.exports = router;

