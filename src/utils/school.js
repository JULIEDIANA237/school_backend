/** Identité de l'établissement, configurable sans modifier le code. */
const schoolName = () => process.env.SCHOOL_NAME || "COLLÈGE BILINGUE CEDEVE";
const schoolShortName = () => process.env.SCHOOL_SHORT_NAME || "CEDEVE";
const frontendUrl = () =>
  (process.env.FRONTEND_URL || "http://localhost:8080").split(",")[0].trim().replace(/\/+$/, "");

/** Fuseau horaire de l'établissement, pour les dates affichées dans les notifications et emails. */
const schoolTimeZone = () => process.env.SCHOOL_TIMEZONE || "Africa/Douala";

/** Date au format JJ/MM/AAAA, dans le fuseau de l'établissement. */
const formatSchoolDate = (value) =>
  value ? new Date(value).toLocaleDateString("fr-FR", { timeZone: schoolTimeZone() }) : "";

module.exports = { schoolName, schoolShortName, frontendUrl, schoolTimeZone, formatSchoolDate };
