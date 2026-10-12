const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Minuscules, sans accents, espaces/ponctuation compactés : « Prénom(s) » → « prenom s ». */
const normalizeText = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Comparaison de noms de classe insensible aux accents, à la casse et aux espaces. */
const compactKey = (value) => normalizeText(value).replace(/\s+/g, "");

/** Regex « égal à, insensible à la casse » sûre pour une valeur saisie. */
const exactInsensitive = (value) => new RegExp(`^${escapeRegex(String(value).trim())}$`, "i");

module.exports = { escapeRegex, escapeHtml, normalizeText, compactKey, exactInsensitive };
