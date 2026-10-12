const express = require("express");
const { protect } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const { requireClassAccess } = require("../../utils/access");
const { spreadsheetUpload } = require("../../utils/upload");
const controller = require("./classSubject.controller");

const router = express.Router();

router.use(protect);

router.get(
  "/class/:classId",
  authorize("admin", "secretary", "teacher"),
  requireClassAccess("classId"),
  controller.getByClass,
);
router.post("/assign", authorize("admin", "secretary"), controller.assign);
router.post(
  "/import-coefficients",
  authorize("admin", "secretary"),
  spreadsheetUpload.single("file"),
  controller.importCoefficients,
);

module.exports = router;
