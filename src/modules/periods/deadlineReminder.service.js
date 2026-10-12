const Period = require("./period.model");
const SchoolYear = require("../schoolYear/schoolYear.model");
const Evaluation = require("../evaluations/evaluation.model");
const TeacherAssignment = require("../teachers/teacherAssignment.model");
const notificationService = require("../notifications/notification.service");
const { sendEmail } = require("../../utils/mail");
const { frontendUrl, formatSchoolDate } = require("../../utils/school");
const { buildSchoolEmail } = require("../../utils/schoolEmail");
const { getSchoolProfile, shortLabel } = require("../school/school.service");
const { httpError } = require("../../utils/httpError");

/** Rappels envoyés aux enseignants, en jours avant la fin de la séquence. */
const REMINDER_DAYS = [7, 3, 1];
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ITEMS_IN_MESSAGE = 6;

const idOf = (value) => String(value?._id ?? value);

/** Jours calendaires restants (les dates de période sont enregistrées à minuit UTC). */
const daysUntil = (endDate, now) => Math.floor(new Date(endDate).getTime() / DAY_MS) - Math.floor(now.getTime() / DAY_MS);

const whenLabel = (daysLeft) => (daysLeft <= 0 ? "aujourd'hui" : daysLeft === 1 ? "demain" : `dans ${daysLeft} jours`);

/**
 * Travail restant par enseignant sur une séquence : évaluations non publiées (à leur auteur)
 * et couples classe / matière sans aucune évaluation (à l'enseignant affecté).
 * @returns {Map<string, { teacher, items: string[] }>}
 */
const pendingWorkByTeacher = async (period) => {
  const year = await SchoolYear.findOne({ name: period.year }).select("_id").lean();
  const [assignments, evaluations] = await Promise.all([
    year
      ? TeacherAssignment.find({ schoolYearId: year._id, isActive: true })
          .populate("classId", "name isActive")
          .populate("subjectId", "name")
          .populate("teacherId", "firstName lastName email role")
          .lean()
      : [],
    Evaluation.find({ period: period._id })
      .select("name class subject teacher isPublished")
      .populate("class", "name")
      .populate("subject", "name")
      .populate("teacher", "firstName lastName email role")
      .lean(),
  ]);

  const work = new Map();
  const add = (teacher, item) => {
    if (!teacher || teacher.role !== "teacher") return;
    const key = idOf(teacher);
    if (!work.has(key)) work.set(key, { teacher, items: [] });
    work.get(key).items.push(item);
  };

  for (const evaluation of evaluations) {
    if (evaluation.isPublished) continue;
    add(evaluation.teacher, `${evaluation.class?.name ?? "?"} – ${evaluation.subject?.name ?? "?"} : « ${evaluation.name} » non publiée`);
  }

  const evaluated = new Set(evaluations.map((e) => `${idOf(e.class)}:${idOf(e.subject)}`));
  for (const assignment of assignments) {
    if (!assignment.classId || assignment.classId.isActive === false || !assignment.subjectId) continue;
    if (evaluated.has(`${idOf(assignment.classId)}:${idOf(assignment.subjectId)}`)) continue;
    add(assignment.teacherId, `${assignment.classId.name} – ${assignment.subjectId.name} : aucune évaluation`);
  }
  return work;
};

/** Notification (et email) à chaque enseignant qui a encore des notes à publier sur la séquence. */
const sendReminders = async (period, daysLeft) => {
  const [work, profile] = await Promise.all([pendingWorkByTeacher(period), getSchoolProfile()]);
  const when = whenLabel(daysLeft);
  const endDate = formatSchoolDate(period.endDate);
  const deadline = daysLeft < 0 ? `est terminée depuis le ${endDate}` : `se termine ${when} (${endDate})`;
  const title = daysLeft < 0 ? `${period.name} terminée : notes en attente` : `Clôture de la ${period.name} ${when}`;
  const notifications = [];
  const emails = [];

  for (const { teacher, items } of work.values()) {
    const shown = items.slice(0, MAX_ITEMS_IN_MESSAGE);
    const others = items.length - shown.length;
    const todo = `${shown.join(" ; ")}${others > 0 ? ` ; et ${others} autre(s)` : ""}`;
    const message = `La ${period.name} ${deadline}. À faire : ${todo}. Publiez vos notes avant la clôture.`;
    notifications.push({
      user: teacher._id,
      title,
      message,
      type: "WARNING",
      link: "/teacher/evaluations",
    });
    if (teacher.email) {
      const { fromName, ...email } = buildSchoolEmail(profile, {
        title,
        greeting: teacher.firstName,
        paragraphs: [`La ${period.name} ${deadline}. Voici ce qui reste à faire :`],
        items,
        cta: { label: "Publier mes notes", url: `${frontendUrl()}/teacher/evaluations` },
      });
      emails.push({ to: teacher.email, subject: `${shortLabel(profile)} – ${title}`, fromName, ...email });
    }
  }

  await notificationService.createMany(notifications);
  for (const email of emails) {
    await sendEmail(email).catch((err) => console.error("[DEADLINE_REMINDER_EMAIL_FAILURE]", err.message));
  }
  return { teachers: notifications.length };
};

/**
 * Rappels automatiques (J-7, J-3, J-1) pour les séquences ouvertes qui se terminent bientôt.
 * Chaque palier n'est envoyé qu'une fois : il est réservé dans la période avant l'envoi,
 * ce qui évite les doublons si plusieurs instances tournent en même temps.
 */
const runDeadlineReminders = async (now = new Date()) => {
  const horizon = new Date(now.getTime() + (Math.max(...REMINDER_DAYS) + 1) * DAY_MS);
  const today = new Date(Math.floor(now.getTime() / DAY_MS) * DAY_MS);
  const periods = await Period.find({
    type: "SEQUENCE",
    isClosed: { $ne: true },
    endDate: { $gte: today, $lte: horizon },
  }).lean();

  const results = [];
  for (const period of periods) {
    const daysLeft = daysUntil(period.endDate, now);
    const due = REMINDER_DAYS.filter((d) => daysLeft <= d && !(period.deadlineReminders || []).includes(d));
    if (daysLeft < 0 || !due.length) continue;
    if (period.parentPeriod && (await Period.exists({ _id: period.parentPeriod, isClosed: true }))) continue;

    const claimed = await Period.updateOne(
      { _id: period._id, deadlineReminders: { $nin: due } },
      { $addToSet: { deadlineReminders: { $each: due } } },
    );
    if (!claimed.modifiedCount) continue;

    const { teachers } = await sendReminders(period, daysLeft);
    results.push({ period: period.name, year: period.year, daysLeft, teachers });
  }
  return results;
};

/** Relance immédiate demandée par l'administration, quelle que soit la date. */
const remindTeachersNow = async (periodId, now = new Date()) => {
  const period = await Period.findById(periodId).lean();
  if (!period) throw httpError(404, "Période introuvable.");
  if (period.type !== "SEQUENCE") throw httpError(400, "Les relances concernent une séquence (les notes sont saisies par séquence).");
  if (period.isClosed) throw httpError(409, "Cette séquence est clôturée.");
  const result = await sendReminders(period, daysUntil(period.endDate, now));
  return { ...result, message: result.teachers ? `${result.teachers} enseignant(s) relancé(s).` : "Aucun enseignant n'a de notes en attente sur cette séquence." };
};

module.exports = { REMINDER_DAYS, runDeadlineReminders, remindTeachersNow, pendingWorkByTeacher };
