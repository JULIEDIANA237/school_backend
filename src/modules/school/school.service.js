const SchoolProfile = require("./school.model");
const { BULLETIN_TEMPLATES } = require("./school.model");
const { httpError } = require("../../utils/httpError");

/** Champs texte modifiables et leur longueur maximale. */
const TEXT_FIELDS = {
  name: 150,
  nameEn: 150,
  shortName: 30,
  motto: 150,
  mottoEn: 150,
  authorization: 80,
  country: 80,
  countryEn: 80,
  nationalMotto: 80,
  nationalMottoEn: 80,
  ministry: 120,
  ministryEn: 120,
  poBox: 30,
  city: 60,
  countryName: 60,
  phone: 80,
  email: 120,
  website: 120,
  headTitle: 60,
  headName: 100,
};

const MAX_LOGO_BYTES = 300 * 1024;
const LOGO_DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Valeurs par défaut neutres : aucun nom d'établissement n'est imposé par le code. */
const defaults = () => ({
  name: process.env.SCHOOL_NAME || "",
  nameEn: "",
  shortName: process.env.SCHOOL_SHORT_NAME || "",
  motto: "",
  mottoEn: "",
  authorization: "",
  country: "RÉPUBLIQUE DU CAMEROUN",
  countryEn: "REPUBLIC OF CAMEROON",
  nationalMotto: "Paix – Travail – Patrie",
  nationalMottoEn: "Peace – Work – Fatherland",
  ministry: "MINISTÈRE DES ENSEIGNEMENTS SECONDAIRES",
  ministryEn: "MINISTRY OF SECONDARY EDUCATION",
  poBox: "",
  city: "",
  countryName: "Cameroun",
  phone: "",
  email: "",
  website: "",
  headTitle: "Le Principal",
  headName: "",
  logo: "",
  primaryColor: "#1e3a8a",
  defaultTemplate: "officiel",
});

// Lecture fréquente (chaque bulletin, chaque email) : cache court, vidé à chaque modification
const CACHE_MS = 60 * 1000;
let cache = { at: 0, value: null };

const toProfile = (doc) => {
  const profile = defaults();
  for (const key of Object.keys(profile)) {
    const value = doc?.[key];
    if (typeof value === "string" && value.trim() !== "") profile[key] = value;
  }
  profile.isConfigured = Boolean(doc?.name?.trim());
  profile.templates = BULLETIN_TEMPLATES;
  return profile;
};

const getSchoolProfile = async () => {
  if (cache.value && Date.now() - cache.at < CACHE_MS) return cache.value;
  const doc = await SchoolProfile.findOne({ key: "default" }).lean();
  cache = { at: Date.now(), value: toProfile(doc) };
  return cache.value;
};

const clearSchoolProfileCache = () => {
  cache = { at: 0, value: null };
};

const assertTemplate = (template) => {
  if (!BULLETIN_TEMPLATES.includes(template)) {
    throw httpError(400, `Modèle de bulletin inconnu « ${template} » (attendu : ${BULLETIN_TEMPLATES.join(", ")}).`);
  }
  return template;
};

/** Mise à jour (administration) : seuls les champs connus sont pris en compte. */
const updateSchoolProfile = async (data = {}) => {
  const $set = {};
  const $unset = {};

  for (const [field, maxLength] of Object.entries(TEXT_FIELDS)) {
    if (data[field] === undefined) continue;
    if (data[field] !== null && typeof data[field] !== "string") throw httpError(400, `Valeur invalide pour « ${field} ».`);
    const value = String(data[field] ?? "").trim();
    if (value.length > maxLength) throw httpError(400, `« ${field} » : ${maxLength} caractères au maximum.`);
    if (value) $set[field] = value;
    else $unset[field] = 1;
  }
  if (data.name !== undefined && !String(data.name ?? "").trim()) {
    throw httpError(400, "Le nom de l'établissement est obligatoire.");
  }
  if ($set.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($set.email)) throw httpError(400, "Adresse email invalide.");

  if (data.logo !== undefined) {
    if (!data.logo) $unset.logo = 1;
    else {
      const logo = String(data.logo);
      if (!LOGO_DATA_URL.test(logo)) throw httpError(400, "Logo invalide : image PNG, JPEG ou WebP attendue.");
      const bytes = Math.floor((logo.length - logo.indexOf(",") - 1) * 0.75);
      if (bytes > MAX_LOGO_BYTES) throw httpError(400, "Logo trop lourd (300 Ko au maximum).");
      $set.logo = logo;
    }
  }
  if (data.primaryColor !== undefined) {
    if (!HEX_COLOR.test(String(data.primaryColor))) throw httpError(400, "Couleur invalide (format #RRGGBB).");
    $set.primaryColor = String(data.primaryColor).toLowerCase();
  }
  if (data.defaultTemplate !== undefined) $set.defaultTemplate = assertTemplate(data.defaultTemplate);

  const update = {};
  if (Object.keys($set).length) update.$set = $set;
  if (Object.keys($unset).length) update.$unset = $unset;
  if (Object.keys(update).length) {
    await SchoolProfile.updateOne({ key: "default" }, update, { upsert: true, runValidators: true });
  }
  clearSchoolProfileCache();
  return getSchoolProfile();
};

/** Nom affiché (emails, SMS) même si le profil n'est pas encore renseigné. */
const displayName = (profile) => profile.name || "Votre établissement";
const shortLabel = (profile) => profile.shortName || profile.name || "Établissement";

module.exports = {
  BULLETIN_TEMPLATES,
  getSchoolProfile,
  updateSchoolProfile,
  clearSchoolProfileCache,
  assertTemplate,
  displayName,
  shortLabel,
};
