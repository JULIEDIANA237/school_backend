const Notification = require("./notification.model");
const { sendEmail } = require("../../utils/mail");
const { sendSMS } = require("../../utils/sms");
const { escapeHtml } = require("../../utils/text");
const { schoolName, schoolShortName, frontendUrl } = require("../../utils/school");

const rankLabel = (bulletin) => {
  if (!bulletin.rank) return "non classé";
  const suffix = bulletin.rank === 1 ? "er" : "e";
  return `${bulletin.rank}${suffix}${bulletin.classifiedCount ? `/${bulletin.classifiedCount}` : ""}`;
};

const averageLabel = (bulletin) =>
  bulletin.generalAverage === null || bulletin.generalAverage === undefined
    ? "non classé"
    : `${Number(bulletin.generalAverage).toFixed(2)}/20`;

const notificationService = {
  async getNotifications(userId) {
    return Notification.find({ user: userId }).sort({ createdAt: -1 }).limit(20);
  },

  async markAsRead(notificationId, userId) {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, user: userId },
      { isRead: true },
      { returnDocument: "after" }
    );
    if (!notification) throw new Error("Notification not found");
    return notification;
  },

  async markAllAsRead(userId) {
    await Notification.updateMany({ user: userId, isRead: false }, { isRead: true });
  },

  async createNotification(data) {
    return Notification.create(data);
  },

  /** Plusieurs notifications en une seule écriture (une erreur n'empêche pas les autres). */
  async createMany(docs) {
    if (!docs.length) return;
    await Notification.insertMany(docs, { ordered: false });
  },

  async deleteNotification(notificationId, userId) {
    return Notification.findOneAndDelete({ _id: notificationId, user: userId });
  },

  /** Notification dans l'application pour chaque parent (rapide, attendue avant de répondre). */
  /** Notifications « Bulletin publié » destinées aux parents d'un élève. */
  bulletinPublicationNotifications(bulletin) {
    const student = bulletin?.student;
    if (!student) return [];
    const periodName = bulletin.period?.name || "la période";
    return (student.parents || []).filter(Boolean).map((parent) => ({
      user: parent._id,
      title: "Bulletin publié",
      message: `Le bulletin de ${student.firstName} pour ${periodName} est disponible. Moyenne : ${averageLabel(bulletin)}, rang : ${rankLabel(bulletin)}.`,
      type: "INFO",
      link: `/parent/bulletins/${bulletin._id}`,
    }));
  },

  async notifyBulletinPublicationInApp(bulletin) {
    return this.notifyBulletinsPublicationInApp([bulletin]);
  },

  /** Une seule insertion pour tous les parents de tous les bulletins publiés. */
  async notifyBulletinsPublicationInApp(bulletins) {
    const docs = bulletins.flatMap((b) => this.bulletinPublicationNotifications(b));
    if (!docs.length) return;
    await Notification.insertMany(docs, { ordered: false }).catch((err) =>
      console.error("[NOTIFICATION_IN_APP_FAILURE]", err.message),
    );
  },

  /**
   * Emails de suivi aux parents (nouvelle évaluation, note publiée), envoyés l'un après l'autre.
   * @param {{ parent: { email, firstName }, content: { title, message } }[]} jobs
   */
  async sendParentEmails(jobs) {
    const link = `${frontendUrl()}/parent`;
    for (const { parent, content } of jobs) {
      try {
        await sendEmail({
          to: parent.email,
          subject: `${schoolShortName()} – ${content.title}`,
          text: `Bonjour ${parent.firstName || "Parent"},\n\n${content.message}\n\nSuivez la scolarité de votre enfant sur votre espace parent : ${link}\n\n${schoolName()}`,
          html: `
            <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: auto;">
              <div style="background: #4f46e5; padding: 16px 20px; border-radius: 8px 8px 0 0;">
                <h2 style="color: white; margin: 0; font-size: 18px;">${escapeHtml(content.title)}</h2>
              </div>
              <div style="border: 1px solid #e5e7eb; padding: 20px; border-radius: 0 0 8px 8px;">
                <p>Bonjour <strong>${escapeHtml(parent.firstName || "Parent")}</strong>,</p>
                <p>${escapeHtml(content.message)}</p>
                <p style="margin: 24px 0;">
                  <a href="${escapeHtml(link)}" style="background: #4f46e5; color: white; padding: 10px 18px; border-radius: 6px; text-decoration: none;">Ouvrir mon espace parent</a>
                </p>
                <p style="color: #6b7280; font-size: 12px;">${escapeHtml(schoolName())}</p>
              </div>
            </div>`,
        });
      } catch (err) {
        console.error("[PARENT_EMAIL_FAILURE]", err.message);
      }
    }
  },

  /** SMS et emails aux parents (lents : exécutés après la réponse HTTP). */
  async sendBulletinPublicationMessages(bulletin) {
    const student = bulletin?.student;
    if (!student) return;
    const periodName = bulletin.period?.name || "Période";
    const studentName = `${student.lastName} ${student.firstName}`;

    for (const parent of (student.parents || []).filter(Boolean)) {
      if (parent.phone) {
        try {
          await sendSMS({
            to: parent.phone,
            message: `[${schoolShortName()}] Bulletin de ${studentName} (${periodName}) disponible. Moy: ${averageLabel(bulletin)}, Rang: ${rankLabel(bulletin)}. Connectez-vous sur votre espace parent.`,
          });
        } catch (err) {
          console.error("[NOTIFICATION_SMS_FAILURE]", err.message);
        }
      }

      if (parent.email && !parent.email.includes("@eduflow.local")) {
        try {
          await sendEmail({
            to: parent.email,
            subject: `Bulletin scolaire - ${studentName} - ${periodName}`,
            html: `
            <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: auto;">
              <div style="background: #4f46e5; padding: 20px; border-radius: 8px 8px 0 0;">
                <h2 style="color: white; margin: 0;">Bulletin scolaire disponible</h2>
              </div>
              <div style="border: 1px solid #e5e7eb; padding: 20px; border-radius: 0 0 8px 8px;">
                <p>Bonjour <strong>${escapeHtml(parent.firstName || "Parent")}</strong>,</p>
                <p>Le bulletin scolaire de votre enfant <strong>${escapeHtml(studentName)}</strong> pour la période <strong>${escapeHtml(periodName)}</strong> a été publié.</p>
                <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4f46e5;">
                  <p style="margin: 5px 0;"><strong>Moyenne générale :</strong> ${escapeHtml(averageLabel(bulletin))}</p>
                  <p style="margin: 5px 0;"><strong>Rang :</strong> ${escapeHtml(rankLabel(bulletin))}</p>
                </div>
                <p>Vous pouvez consulter le bulletin détaillé dans votre espace parent :</p>
                <a href="${escapeHtml(frontendUrl())}/parent/bulletins/${escapeHtml(String(bulletin._id))}"
                   style="display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
                   Accéder à mon espace
                </a>
                <p style="margin-top: 30px; font-size: 0.85em; color: #666;">
                  Cordialement,<br>
                  L'administration du <strong>${escapeHtml(schoolName())}</strong>
                </p>
              </div>
            </div>
          `,
          });
        } catch (err) {
          console.error("[NOTIFICATION_EMAIL_FAILURE]", err.message);
        }
      }
    }
  },
};

module.exports = notificationService;
