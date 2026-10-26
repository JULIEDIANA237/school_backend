const mongoose = require("mongoose");

const { Schema, model } = mongoose;

/**
 * Enregistrement de pointage officiel de présence pour les enseignants.
 * Pointage à l'arrivée et au départ uniquement (2 enregistrements par jour max par enseignant).
 */
const teacherAttendanceRecordSchema = new Schema(
  {
    teacherId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    schoolYearId: {
      type: Schema.Types.ObjectId,
      ref: "SchoolYear",
      required: true,
      index: true,
    },
    date: {
      type: String,
      required: true,
      index: true, // "YYYY-MM-DD"
    },
    time: {
      type: String,
      required: true, // "HH:MM:SS"
    },
    type: {
      type: String,
      enum: ["ARRIVAL", "DEPARTURE"],
      required: true,
      index: true,
    },
    mode: {
      type: String,
      enum: ["KIOSK_SCAN", "BADGE_SCAN"],
      required: true,
      default: "KIOSK_SCAN",
    },
    scannedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Données GPS
    teacherLat: { type: Number, required: true },
    teacherLng: { type: Number, required: true },
    schoolLat: { type: Number, default: null },
    schoolLng: { type: Number, default: null },
    distanceMeters: { type: Number, required: true },

    status: {
      type: String,
      enum: ["VALID", "OUT_OF_RANGE", "EXPIRED_QR"],
      default: "VALID",
      index: true,
    },

    qrToken: { type: String, required: true },
    pointedAt: { type: Date, default: Date.now },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

// Règle d'unicité : un enseignant ne peut avoir qu'un seul ARRIVAL et un seul DEPARTURE par date
teacherAttendanceRecordSchema.index(
  { teacherId: 1, date: 1, type: 1 },
  { unique: true }
);

module.exports = model("TeacherAttendanceRecord", teacherAttendanceRecordSchema);

