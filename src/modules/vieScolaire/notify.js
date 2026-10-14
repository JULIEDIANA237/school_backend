const { waitUntil } = require("@vercel/functions");
const Student = require("../students/student.model");
const User = require("../users/user.model");
const ClassModel = require("../classes/class.model");
const notificationService = require("../notifications/notification.service");
const { formatDay } = require("./days");
const { hoursText } = require("./settings.service");

const PARENT_LINK = "/parent/vie-scolaire";
const STAFF_LINK = "/vie-scolaire?onglet=justificatifs";

const byGender = (student, masculine, feminine) =>
  student?.gender === "F" ? feminine : student?.gender === "M" ? masculine : `${masculine}(e)`;

const slot = ({ startTime, subjectName, className }) =>
  [startTime && `à ${startTime}`, subjectName, className].filter(Boolean).join(", ");

/**
 * Notification dans l'application pour chaque parent, puis email après la réponse HTTP.
 * Un échec n'empêche jamais l'action de l'enseignant ou de la vie scolaire.
 * @param {{ studentId, title, message, type? }[]} items
 */
const notifyParents = async (items) => {
  if (!items.length) return 0;
  try {
    const ids = [...new Set(items.map((i) => String(i.studentId)))];
    const students = await Student.find({ _id: { $in: ids } })
      .select("parents")
      .populate("parents", "email firstName settings.notifications.email")
      .lean();
    const parentsOf = new Map(students.map((s) => [String(s._id), (s.parents || []).filter(Boolean)]));

    const notifications = [];
    const emails = [];
    for (const item of items) {
      for (const parent of parentsOf.get(String(item.studentId)) || []) {
        const content = { title: item.title, message: item.message, link: PARENT_LINK, ctaLabel: "Voir l'assiduité" };
        notifications.push({ user: parent._id, type: item.type || "WARNING", title: item.title, message: item.message, link: PARENT_LINK });
        if (parent.email && parent.settings?.notifications?.email !== false) emails.push({ parent, content });
      }
    }
    await notificationService.createMany(notifications);
    if (emails.length && process.env.PARENT_EMAILS !== "false") waitUntil(notificationService.sendParentEmails(emails));
    return notifications.length;
  } catch (err) {
    console.error("[VIE_SCOLAIRE_NOTIFICATION_FAILURE]", err.message);
    return 0;
  }
};

/** Absence ou retard relevé (appel ou saisie de la vie scolaire). */
const recordMessage = (record, student, context) => {
  const when = `le ${formatDay(record.day)}${slot(context) ? ` (${slot(context)})` : ""}`;
  if (record.kind === "late") {
    return {
      studentId: student._id,
      title: `Retard : ${student.firstName}`,
      message: `${student.firstName} est ${byGender(student, "arrivé", "arrivée")} en retard${
        record.minutesLate ? ` de ${record.minutesLate} min` : ""
      } ${when}.`,
    };
  }
  return {
    studentId: student._id,
    title: `Absence : ${student.firstName}`,
    message:
      `${student.firstName} était ${byGender(student, "absent", "absente")} ${when} : ${hoursText(record.hours)} d'absence. ` +
      "Si cette absence est justifiée, envoyez un justificatif depuis votre espace parent.",
  };
};

/** Élève finalement présent : l'absence ou le retard signalé est annulé. */
const correctionMessage = (record, student, context) => ({
  studentId: student._id,
  type: "INFO",
  title: `Correction : ${student.firstName} était ${byGender(student, "présent", "présente")}`,
  message: `Le signalement du ${formatDay(record.day)}${slot(context) ? ` (${slot(context)})` : ""} est annulé : ${
    student.firstName
  } était bien en classe.`,
});

const INCIDENT_TITLES = {
  retenue: "Retenue",
  exclusion: "Exclusion temporaire",
  avertissement: "Avertissement de conduite",
  blame: "Blâme de conduite",
};

const incidentMessage = (incident, student) => {
  const date = formatDay(incident.day);
  const detail = {
    retenue: `${student.firstName} a reçu une retenue de ${hoursText(incident.hours || 0)} le ${date}.`,
    exclusion: `${student.firstName} est ${byGender(student, "exclu", "exclue")} temporairement pour ${incident.days || 0} jour(s) à compter du ${date}.`,
    avertissement: `${student.firstName} a reçu un avertissement de conduite le ${date}.`,
    blame: `${student.firstName} a reçu un blâme de conduite le ${date}.`,
  }[incident.type];
  return {
    studentId: student._id,
    title: `${INCIDENT_TITLES[incident.type]} : ${student.firstName}`,
    message: `${detail} Motif : ${incident.reason}`,
  };
};

const reviewMessage = (record, student, accepted, note) => ({
  studentId: student._id,
  type: accepted ? "SUCCESS" : "WARNING",
  title: `Justificatif ${accepted ? "accepté" : "refusé"} : ${student.firstName}`,
  message: accepted
    ? `L'absence du ${formatDay(record.day)} est désormais justifiée.`
    : `Le justificatif envoyé pour le ${formatDay(record.day)} n'a pas été accepté${note ? ` : ${note}` : "."}`,
});

/**
 * Prévient la vie scolaire dans l'application : le surveillant général de la classe, qui traite la demande.
 * Classe sans surveillant : l'administration, pour que la demande ne reste pas sans réponse.
 */
const notifyVieScolaire = async ({ classId, title, message, link = STAFF_LINK }) => {
  try {
    const classDoc = classId ? await ClassModel.findById(classId).select("supervisor").lean() : null;
    let staff = classDoc?.supervisor
      ? await User.find({ _id: classDoc.supervisor, ...User.SUPERVISOR_QUERY }).select("_id").lean()
      : [];
    if (!staff.length) staff = await User.find({ role: "admin" }).select("_id").lean();
    await notificationService.createMany(staff.map((u) => ({ user: u._id, type: "INFO", title, message, link })));
  } catch (err) {
    console.error("[VIE_SCOLAIRE_STAFF_NOTIFICATION_FAILURE]", err.message);
  }
};

module.exports = {
  notifyParents,
  notifyVieScolaire,
  recordMessage,
  correctionMessage,
  incidentMessage,
  reviewMessage,
  byGender,
};
