const mongoose = require("mongoose");

/**
 * Enregistrement de pointage d'un élève (arrivée OU départ).
 * Un élève peut avoir au maximum 2 records par session : ARRIVAL puis DEPARTURE.
 */
const attendanceGeoRecordSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AttendanceSession",
      required: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    /** userId du compte élève (rôle student) */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    /** Type du pointage */
    type: { type: String, enum: ["ARRIVAL", "DEPARTURE"], required: true },

    /** Coordonnées GPS de l'élève au moment du scan */
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },

    /** Distance calculée par rapport à la position de l'enseignant (mètres) */
    distanceMeters: { type: Number, required: true },

    /**
     * VALID  : dans le rayon → pointage accepté
     * OUT_OF_RANGE : hors rayon → enregistré mais signalé
     * INVALID_TOKEN : token QR expiré ou inconnu
     */
    status: {
      type: String,
      enum: ["VALID", "OUT_OF_RANGE", "INVALID_TOKEN"],
      required: true,
    },

    /** Token QR utilisé pour ce pointage */
    qrToken: { type: String, required: true },

    pointedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Un élève ne peut pointer qu'une seule fois par type (ARRIVAL ou DEPARTURE) dans une session
attendanceGeoRecordSchema.index(
  { sessionId: 1, studentId: 1, type: 1 },
  { unique: true }
);

module.exports = mongoose.model("AttendanceGeoRecord", attendanceGeoRecordSchema);

