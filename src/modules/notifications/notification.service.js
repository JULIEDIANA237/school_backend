const Notification = require("./notification.model");
const { sendEmail } = require("../../utils/mail");
const { sendSMS } = require("../../utils/sms");
const { frontendUrl } = require("../../utils/school");
const { buildSchoolEmail } = require("../../utils/schoolEmail");
const { getSchoolProfile, displayName, shortLabel } = require("../school/school.service");

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
   * Emails de suivi aux parents (nouvelle évaluation, note publiée), envoyés l'un après l'autre,
   * aux couleurs et avec les coordonnées de l'établissement.
   * @param {{ parent: { email, firstName }, content: { title, message } }[]} jobs
   */
  async sendParentEmails(jobs) {
    const profile = await getSchoolProfile();
    const link = `${frontendUrl()}/parent`;
    for (const { parent, content } of jobs) {
      try {
        const { fromName, ...email } = buildSchoolEmail(profile, {
          title: content.title,
          greeting: parent.firstName || "Parent",
          paragraphs: [content.message, "Suivez la scolarité de votre enfant tout au long de l'année depuis votre espace parent."],
          cta: { label: "Ouvrir mon espace parent", url: link },
        });
        await sendEmail({ to: parent.email, subject: `${shortLabel(profile)} – ${content.title}`, fromName, ...email });
      } catch (err) {
        console.error("[PARENT_EMAIL_FAILURE]", err.message);
      }
    }
  },

  /** SMS et emails aux parents (lents : exécutés après la réponse HTTP). */
  async sendBulletinPublicationMessages(bulletin) {
    const student = bulletin?.student;
    if (!student) return;
    const profile = await getSchoolProfile();
    const periodName = bulletin.period?.name || "Période";
    const studentName = `${student.lastName} ${student.firstName}`;

    for (const parent of (student.parents || []).filter(Boolean)) {
      if (parent.phone) {
        try {
          await sendSMS({
            to: parent.phone,
            message: `[${shortLabel(profile)}] Bulletin de ${studentName} (${periodName}) disponible. Moy: ${averageLabel(bulletin)}, Rang: ${rankLabel(bulletin)}. Connectez-vous sur votre espace parent.`,
          });
        } catch (err) {
          console.error("[NOTIFICATION_SMS_FAILURE]", err.message);
        }
      }

      if (parent.email) {
        try {
          const { fromName, ...email } = buildSchoolEmail(profile, {
            title: "Bulletin scolaire disponible",
            greeting: parent.firstName || "Parent",
            paragraphs: [
              `Le bulletin de votre enfant ${studentName} pour la période ${periodName} a été publié.`,
              `L'administration de ${displayName(profile)}`,
            ],
            highlight: [`Moyenne générale : ${averageLabel(bulletin)}`, `Rang : ${rankLabel(bulletin)}`],
            cta: { label: "Voir le bulletin", url: `${frontendUrl()}/parent/bulletins/${bulletin._id}` },
          });
          await sendEmail({
            to: parent.email,
            subject: `${shortLabel(profile)} – Bulletin de ${studentName} (${periodName})`,
            fromName,
            ...email,
          });
        } catch (err) {
          console.error("[NOTIFICATION_EMAIL_FAILURE]", err.message);
        }
      }
    }
  },
};

module.exports = notificationService;
