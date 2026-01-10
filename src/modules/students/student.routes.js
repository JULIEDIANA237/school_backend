const express = require("express");
const StudentController = require("./student.controller");
const { protect } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");

const router = express.Router();

router.post("/", protect, authorize("admin"), StudentController.create);
router.put("/:id", protect, authorize("admin"), StudentController.update);

router.get("/class/:classId", protect, StudentController.byClass);
router.get("/parent/me", protect, authorize("parent"), StudentController.byParent);

router.post(
  "/:studentId/parent",
  protect,
  authorize("admin"),
  StudentController.addParent
);

router.patch(
  "/:studentId/class",
  protect,
  authorize("admin"),
  StudentController.changeClass
);

router.patch(
  "/deactivate/:studentId",
  protect,
  authorize("admin"),
  StudentController.deactivate
);

module.exports = router;
