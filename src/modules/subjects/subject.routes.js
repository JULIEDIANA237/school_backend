const express = require("express");
const SubjectController = require("./subject.controller");
const { protect } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");

const router = express.Router();

router.post("/", protect, authorize("admin"), SubjectController.create);
router.put("/:id", protect, authorize("admin"), SubjectController.update);
router.get("/", protect, SubjectController.list);
router.patch("/disable/:id", protect, authorize("admin"), SubjectController.disable);

module.exports = router;
