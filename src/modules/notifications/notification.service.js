const Notification = require("./notification.model");
const { sendEmail } = require("../../utils/mail");
const { sendSMS } = require("../../utils/sms");

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

  /**
   * Notifie les parents lors de la publication d'un bulletin
   */
  async notifyBulletinPublication(bulletin) {
    if (!bulletin || !bulletin.student) return;

    const student = bulletin.student;
    const parents = student.parents || [];
    const avg = bulletin.generalAverage || 0;
    const rank = bulletin.rank || 0;
    const total = bulletin.classProfile?.totalStudents || "?";
    const periodName = bulletin.period?.name || "Période";

    for (const parent of parents) {
      if (!parent) continue;

      // 1. Notification In-App
      try {
        await this.createNotification({
          user: parent._id,
          title: "Bulletin publié",
          message: `Le bulletin de ${student.firstName} pour ${periodName} est disponible.`,
          type: "INFO",
          link: `/parent/bulletins?id=${bulletin._id}`
        });
      } catch (err) {
        console.error(`   ❌ Échec notification In-App pour le parent ${parent._id}:`, err.message);
      }

      // 2. Notification SMS
      if (parent.phone) {
        try {
          const smsText = `[CEDEVE] Le bulletin de ${student.lastName} ${student.firstName} (${periodName}) est disponible. Moyenne: ${avg}/20, Rang: ${rank}/${total}.`;
          await sendSMS({ to: parent.phone, message: smsText });
        } catch (err) {
          console.error(`   ❌ Échec SMS pour le parent ${parent.phone}:`, err.message);
        }
      }

      // 3. Notification Email
      if (parent.email && !parent.email.includes("@eduflow.local")) {
        try {
          const emailSubject = `Bulletin Scolaire - ${student.lastName} ${student.firstName} - ${periodName}`;
          const emailHtml = `
            <div style="font-family: sans-serif; color: #333;">
              <h2 style="color: #4f46e5;">Bulletin Scolaire Disponible</h2>
              <p>Bonjour ${parent.firstName || "Parent"},</p>
              <p>Le bulletin scolaire de votre enfant <strong>${student.lastName} ${student.firstName}</strong> pour la période <strong>${periodName}</strong> a été publié.</p>
              
              <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Moyenne Générale :</strong> ${avg} / 20</p>
                <p style="margin: 5px 0;"><strong>Rang :</strong> ${rank}<sup>${rank === 1 ? 'er' : 'e'}</sup> sur ${total} élèves</p>
              </div>

              <p>Vous pouvez consulter le bulletin détaillé en vous connectant à votre espace parent :</p>
              <a href="${process.env.FRONTEND_URL || 'http://localhost:8080'}/login" 
                 style="display: inline-block; background: #4f46e5; color: white; padding: 10px 20px; border-radius: 5px; text-decoration: none;">
                 Accéder à mon espace
              </a>
              
              <p style="margin-top: 30px; font-size: 0.8em; color: #666;">
                Cordialement,<br>
                L'administration du COLLEGE BILINGUE CEDEVE
              </p>
            </div>
          `;
          await sendEmail({ to: parent.email, subject: emailSubject, html: emailHtml });
        } catch (err) {
          console.error(`   ❌ Échec Email pour le parent ${parent.email}:`, err.message);
        }
      }
    }
  }
};

module.exports = notificationService;
