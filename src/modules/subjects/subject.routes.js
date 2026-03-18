const express = require("express");
const multer = require("multer");
const { protect } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const controller = require("./subject.controller");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(protect);

router.post("/", authorize("admin", "secretary"), controller.create);
router.post("/import-subjects", authorize("admin", "secretary"), upload.single("file"), controller.importExcel);
router.get("/", authorize("admin", "secretary", "teacher"), controller.getAll);
router.put("/:id", authorize("admin", "secretary"), controller.update);
router.delete("/:id", authorize("admin", "secretary"), controller.disable);

module.exports = router;
