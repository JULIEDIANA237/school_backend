const express = require("express");
const Controller = require("./teacherAssignment.controller");
const { protect } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");

const router = express.Router();

router.post(
  "/",
  protect,
  authorize("admin"),
  Controller.assign
);

router.get(
  "/",
  protect,
  authorize("admin"),
  Controller.getAll
);

router.delete(
  "/:id",
  protect,
  authorize("admin"),
  Controller.unassign
);

router.get(
  "/me",
  protect,
  authorize("teacher"),
  Controller.myClasses
);

router.get(
  "/class/:classId",
  protect,
  authorize("admin", "teacher"),
  Controller.classSubjects
);

module.exports = router;
