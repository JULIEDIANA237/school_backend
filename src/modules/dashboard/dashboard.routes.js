const express = require("express");
const { protect } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const controller = require("./dashboard.controller");

const router = express.Router();

router.get("/stats", protect, authorize("admin"), controller.getAdminStats);
router.get("/available-years", protect, authorize("admin"), controller.getAvailableYears);

module.exports = router;
