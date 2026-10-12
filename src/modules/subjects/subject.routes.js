const express = require("express");
const { protect } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const { spreadsheetUpload } = require("../../utils/upload");
const controller = require("./subject.controller");

const router = express.Router();
const staff = authorize("admin", "secretary");

router.use(protect);

router.post("/", staff, controller.create);
router.post("/import-subjects", staff, spreadsheetUpload.single("file"), controller.importExcel);
router.get("/", authorize("admin", "secretary", "teacher"), controller.getAll);
router.put("/:id", staff, controller.update);
router.delete("/:id", staff, controller.disable);

module.exports = router;
