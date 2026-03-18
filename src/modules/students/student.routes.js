const express = require("express");
const multer = require("multer");
const StudentController = require("./student.controller");
const { protect } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/", protect, authorize("admin", "secretary"), StudentController.create);
router.post("/import", protect, authorize("admin", "secretary"), upload.single("file"), StudentController.importExcel);
router.get("/", protect, authorize("admin", "secretary"), StudentController.getAll);
router.put("/:id", protect, authorize("admin", "secretary"), StudentController.update);

router.get("/class/:classId", protect, StudentController.byClass);
router.get("/parent/me", protect, authorize("parent"), StudentController.byParent);

router.post(
  "/:studentId/parent",
  protect,
  authorize("admin", "secretary"),
  StudentController.addParent
);

router.patch(
  "/:studentId/class",
  protect,
  authorize("admin", "secretary"),
  StudentController.changeClass
);

router.patch(
  "/deactivate/:studentId",
  protect,
  authorize("admin", "secretary"),
  StudentController.deactivate
);

module.exports = router;
