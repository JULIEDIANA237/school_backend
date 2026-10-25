const mongoose = require("mongoose");

const { Schema, model } = mongoose;

/**
 * Créneaux types de la journée scolaire (ex: 07:30 - 08:30, 08:30 - 09:30, etc.)
 */
const timeSlotSchema = new Schema(
  {
    name: { type: String, required: true, trim: true }, // ex: "M1", "M2", "Pause", "S1"
    dayOfWeek: { type: Number, min: 1, max: 6, default: null }, // 1 = Lundi, 6 = Samedi, null = tous les jours
    startTime: { type: String, required: true, trim: true }, // Format "HH:MM", ex "07:30"
    endTime: { type: String, required: true, trim: true }, // Format "HH:MM", ex "08:30"
    order: { type: Number, default: 1 },
    isBreak: { type: Boolean, default: false }, // Récréation ou pause déjeuner
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

timeSlotSchema.index({ order: 1 });
timeSlotSchema.index({ startTime: 1, endTime: 1 });

module.exports = model("TimeSlot", timeSlotSchema);

