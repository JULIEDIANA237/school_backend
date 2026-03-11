const express = require("express");
const notificationController = require("./notification.controller");
const { protect } = require("../../middlewares/auth.middleware");

const router = express.Router();

router.get("/", protect, notificationController.getMyNotifications);
router.patch("/:id/read", protect, notificationController.markAsRead);
router.post("/read-all", protect, notificationController.markAllAsRead);

module.exports = router;
