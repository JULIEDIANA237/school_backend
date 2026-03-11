const notificationService = require("./notification.service");

const notificationController = {
  async getMyNotifications(req, res) {
    try {
      const notifications = await notificationService.getNotifications(req.user.id);
      res.json(notifications);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async markAsRead(req, res) {
    try {
      const notification = await notificationService.markAsRead(req.params.id, req.user.id);
      res.json(notification);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async markAllAsRead(req, res) {
    try {
      await notificationService.markAllAsRead(req.user.id);
      res.json({ message: "All notifications marked as read" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = notificationController;
