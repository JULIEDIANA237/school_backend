const mongoose = require("mongoose");

/** Règlement intérieur de l'établissement : seuils d'alerte et barème (un seul document par base). */
const vieScolaireSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "default", unique: true },
    alertUnjustifiedHours: Number,
    alertLateCount: Number,
    warningUnjustifiedHours: Number,
    blameUnjustifiedHours: Number,
    exclusionUnjustifiedHours: Number,
    defaultSessionHours: Number,
    notifyAbsence: Boolean,
    notifyLate: Boolean,
    notifyIncident: Boolean,
  },
  { timestamps: true }
);

module.exports = mongoose.model("VieScolaireSettings", vieScolaireSettingsSchema);
