const Notification = require("./notification.model");
const { sendEmail } = require("../../utils/mail");
const { sendSMS } = require("../../utils/sms");
const Bulletin = require("../bulletins/bulletin.model");

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
   * Notifie les parents lors de la publication d'un bulletin.
   */
  async notifyBulletinPublication(bulletin) {
    if (!bulletin || !bulletin.student) return;

    const student = bulletin.student;
    const parents = student.parents || [];
    const avg = (bulletin.generalAverage || 0).toFixed(2);
    const rank = bulletin.rank || 0;
    const rankSuffix = rank === 1 ? "er" : "e";
    const periodName = bulletin.period?.name || "Période";

    // Compter le nombre total d'élèves dans la même classe/période
    let total = "?";
    try {
      const classId = bulletin.class?._id || bulletin.class;
      const periodId = bulletin.period?._id || bulletin.period;
      if (classId && periodId) {
        total = await Bulletin.countDocuments({ class: classId, period: periodId });
      }
    } catch (err) {
      console.warn("   ⚠️  Impossible de compter les élèves:", err.message);
    }

    console.log(`\n📣 Notification de publication du bulletin - ${student.lastName} ${student.firstName}`);
    console.log(`   👨‍👩‍👧 Parents à notifier : ${parents.length}`);

    for (const parent of parents) {
      if (!parent) continue;

      console.log(`\n   🔔 Notification pour le parent : ${parent.firstName || ""} ${parent.lastName || ""} (${parent.email || "pas d'email"})`);

      // 1. Notification In-App
      try {
        await this.createNotification({
          user: parent._id,
          title: "Bulletin publié",
          message: `Le bulletin de ${student.firstName} pour ${periodName} est disponible. Moyenne: ${avg}/20, Rang: ${rank}${rankSuffix}/${total}.`,
          type: "INFO",
          link: `/parent/bulletins?id=${bulletin._id}`
        });
        console.log(`   ✅ Notification In-App créée`);
      } catch (err) {
        console.error(`   ❌ Échec notification In-App:`, err.message);
      }

      // 2. Notification SMS
      if (parent.phone) {
        try {
          const smsText = `[CEDEVE] Bulletin de ${student.lastName} ${student.firstName} (${periodName}) disponible. Moy: ${avg}/20, Rang: ${rank}${rankSuffix}/${total}. Connectez-vous sur votre espace parent.`;
          console.log(`   📱 Envoi SMS à ${parent.phone}...`);
          await sendSMS({ to: parent.phone, message: smsText });
        } catch (err) {
          console.error(`   ❌ Échec SMS (${parent.phone}):`, err.message);
        }
      } else {
        console.log(`   📱 Pas de numéro de téléphone pour ce parent, SMS ignoré.`);
      }

      // 3. Notification Email
      if (parent.email && !parent.email.includes("@eduflow.local")) {
        try {
          const emailSubject = `Bulletin Scolaire - ${student.lastName} ${student.firstName} - ${periodName}`;
          const emailHtml = `
            <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: auto;">
              <div style="background: #4f46e5; padding: 20px; border-radius: 8px 8px 0 0;">
                <h2 style="color: white; margin: 0;">📋 Bulletin Scolaire Disponible</h2>
              </div>
              <div style="border: 1px solid #e5e7eb; padding: 20px; border-radius: 0 0 8px 8px;">
                <p>Bonjour <strong>${parent.firstName || "Parent"}</strong>,</p>
                <p>Le bulletin scolaire de votre enfant <strong>${student.lastName} ${student.firstName}</strong> pour la période <strong>${periodName}</strong> a été publié.</p>
                
                <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4f46e5;">
                  <p style="margin: 5px 0;"><strong>Moyenne Générale :</strong> ${avg} / 20</p>
                  <p style="margin: 5px 0;"><strong>Rang :</strong> ${rank}<sup>${rankSuffix}</sup> sur ${total} élève${total > 1 ? 's' : ''}</p>
                </div>

                <p>Vous pouvez consulter le bulletin détaillé en vous connectant à votre espace parent :</p>
                <a href="${process.env.FRONTEND_URL || 'http://localhost:8080'}/login" 
                   style="display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
                   Accéder à mon espace →
                </a>
                
                <p style="margin-top: 30px; font-size: 0.85em; color: #666;">
                  Cordialement,<br>
                  L'administration du <strong>COLLEGE BILINGUE CEDEVE</strong>
                </p>
              </div>
            </div>
          `;
          console.log(`   📧 Envoi email à ${parent.email}...`);
          await sendEmail({ to: parent.email, subject: emailSubject, html: emailHtml });
          console.log(`   ✅ Email envoyé à ${parent.email}`);
        } catch (err) {
          console.error(`   ❌ Échec Email (${parent.email}):`, err.message);
        }
      } else {
        console.log(`   📧 Pas d'adresse email valide pour ce parent, email ignoré.`);
      }
    }

    console.log(`\n✅ Notifications terminées pour le bulletin de ${student.lastName} ${student.firstName}\n`);
  }
};

module.exports = notificationService;
