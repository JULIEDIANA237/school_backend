const express = require("express");
const multer = require("multer");
const { protect } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const controller = require("./classSubject.controller");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(protect);

router.get("/class/:classId", authorize("admin", "secretary", "teacher"), controller.getByClass);
router.post("/assign", authorize("admin", "secretary"), controller.assign);
router.post("/import-coefficients", authorize("admin", "secretary"), upload.single("file"), controller.importCoefficients);

module.exports = router;
