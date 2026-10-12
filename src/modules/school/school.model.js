const mongoose = require("mongoose");

/** Modèles de bulletin proposés à la génération. */
const BULLETIN_TEMPLATES = ["officiel", "classique", "moderne"];

/**
 * Profil de l'établissement (document unique) : identité imprimée sur les bulletins et
 * reprise dans les emails. Chaque établissement a sa propre base, donc son propre profil.
 */
const schoolProfileSchema = new mongoose.Schema(
  {
    key: { type: String, default: "default", unique: true },
    // Identité
    name: String,
    nameEn: String,
    shortName: String,
    motto: String,
    mottoEn: String,
    authorization: String, // N° d'autorisation ou d'immatriculation de l'établissement
    // En-tête officiel (modèle bilingue)
    country: String,
    countryEn: String,
    nationalMotto: String,
    nationalMottoEn: String,
    ministry: String,
    ministryEn: String,
    // Coordonnées
    poBox: String,
    city: String,
    countryName: String,
    phone: String,
    email: String,
    website: String,
    // Signature
    headTitle: String, // « Le Principal », « Le Directeur », « Le Proviseur »…
    headName: String,
    // Apparence
    logo: String, // image en data URL (PNG, JPEG ou WebP)
    primaryColor: String,
    defaultTemplate: { type: String, enum: BULLETIN_TEMPLATES, default: "officiel" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SchoolProfile", schoolProfileSchema);
module.exports.BULLETIN_TEMPLATES = BULLETIN_TEMPLATES;
