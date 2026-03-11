const Notification = require("./notification.model");

const notificationService = {
  async getNotifications(userId) {
    return await Notification.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(20);
  },

  async markAsRead(notificationId, userId) {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, user: userId },
      { isRead: true },
      { new: true }
    );
    if (!notification) throw new Error("Notification not found");
    return notification;
  },

  async markAllAsRead(userId) {
    await Notification.updateMany({ user: userId, isRead: false }, { isRead: true });
  },

  async createNotification(data) {
    return await Notification.create(data);
  },

  async deleteNotification(notificationId, userId) {
    return await Notification.findOneAndDelete({ _id: notificationId, user: userId });
  },
};

module.exports = notificationService;
