const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { httpError } = require("./httpError");

const MIN_PASSWORD_LENGTH = 8;
// Sans caractères ambigus (0/O, 1/l/I) pour faciliter la saisie d'un mot de passe provisoire
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

const generateTemporaryPassword = (length = 10) => {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return out;
};

const assertValidPassword = (password) => {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    throw httpError(400, `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`);
  }
  if (password.length > 128) throw httpError(400, "Le mot de passe est trop long.");
};

const hashPassword = (password) => bcrypt.hash(password, 10);

/**
 * Mot de passe provisoire généré (≈ 58 bits d'entropie) : un coût bcrypt plus faible suffit
 * et permet d'importer des centaines de comptes sans dépasser la durée d'une fonction serverless.
 * Il est remplacé (coût 10) dès la première connexion.
 */
const hashTemporaryPassword = (password) => bcrypt.hash(password, 8);

/**
 * Date à enregistrer dans passwordChangedAt. On retire une seconde car le champ
 * `iat` des JWT est arrondi à la seconde : un jeton émis juste après le changement
 * doit rester valide.
 */
const passwordChangeTimestamp = () => new Date(Date.now() - 1000);

const normalizePhone = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).replace(/[\s.\-()]/g, "").trim();
};

module.exports = {
  MIN_PASSWORD_LENGTH,
  generateTemporaryPassword,
  assertValidPassword,
  hashPassword,
  hashTemporaryPassword,
  passwordChangeTimestamp,
  normalizePhone,
};
