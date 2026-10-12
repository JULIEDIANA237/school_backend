// L'identité de l'établissement (nom, logo, coordonnées) est enregistrée en base : voir modules/school.

/**
 * Adresse publique de l'application, utilisée dans les liens des emails. PUBLIC_APP_URL si elle est
 * définie (indispensable en local : un lien « localhost » ne s'ouvre pas sur le téléphone du parent),
 * sinon la première origine de FRONTEND_URL.
 */
const frontendUrl = () =>
  (process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || "http://localhost:8080").split(",")[0].trim().replace(/\/+$/, "");

/** Fuseau horaire de l'établissement, pour les dates affichées dans les notifications et emails. */
const schoolTimeZone = () => process.env.SCHOOL_TIMEZONE || "Africa/Douala";

/** Date au format JJ/MM/AAAA, dans le fuseau de l'établissement. */
const formatSchoolDate = (value) =>
  value ? new Date(value).toLocaleDateString("fr-FR", { timeZone: schoolTimeZone() }) : "";

module.exports = { frontendUrl, schoolTimeZone, formatSchoolDate };
