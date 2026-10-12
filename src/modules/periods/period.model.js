const mongoose = require("mongoose");

const periodSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["TRIMESTRE", "SEQUENCE"],
      default: "SEQUENCE",
    },
    // Obligatoire pour une SEQUENCE : le trimestre auquel elle appartient
    parentPeriod: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Period",
    },
    year: {
      type: String,
      required: true,
      index: true, // nom de l'année scolaire, ex: 2024-2025
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isActive: { type: Boolean, default: false },
    // Période clôturée : notes et évaluations figées (s'applique aussi aux séquences d'un trimestre clôturé)
    isClosed: { type: Boolean, default: false },
    // Rappels de clôture déjà envoyés aux enseignants (jours avant la fin : 7, 3, 1)
    deadlineReminders: { type: [Number], default: [] },
  },
  { timestamps: true }
);

// Une période unique par nom + année
periodSchema.index({ name: 1, year: 1 }, { unique: true });

module.exports = mongoose.model("Period", periodSchema);
