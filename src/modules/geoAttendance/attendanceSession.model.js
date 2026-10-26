const mongoose = require("mongoose");

/**
 * Session de pointage géolocalisé ouverte par un enseignant.
 * Le token QR tourne toutes les 30 secondes (re-signé par le frontend via /refresh-qr).
 */
const attendanceSessionSchema = new mongoose.Schema(
  {
    /** Enseignant qui ouvre la session */
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    /** Classe concernée */
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true },
    /** Matière (optionnelle) */
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject" },
    /** Année scolaire */
    schoolYearId: { type: mongoose.Schema.Types.ObjectId, ref: "SchoolYear" },

    /** Coordonnées GPS de l'enseignant au moment de l'ouverture */
    teacherLat: { type: Number, required: true },
    teacherLng: { type: Number, required: true },

    /** Rayon de tolérance en mètres (défaut 100 m) */
    radiusMeters: { type: Number, default: 100, min: 10, max: 1000 },

    /** Token court-vécu pour le QR (UUID v4 régénéré toutes les 30 s) */
    qrToken: { type: String, required: true, index: true },
    /** Horodatage de la dernière rotation du QR */
    qrRotatedAt: { type: Date, default: Date.now },

    /** Durée de validité d'un token QR en secondes */
    qrTtlSeconds: { type: Number, default: 30 },

    status: { type: String, enum: ["open", "closed"], default: "open" },

    /** Date de la séance (YYYY-MM-DD) */
    date: { type: String, required: true },
    /** Heure de début/fin de la séance */
    startTime: { type: String },
    endTime: { type: String },

    openedAt: { type: Date, default: Date.now },
    closedAt: { type: Date },
  },
  { timestamps: true }
);

attendanceSessionSchema.index({ classId: 1, date: 1, status: 1 });
attendanceSessionSchema.index({ teacherId: 1, status: 1 });

module.exports = mongoose.model("AttendanceSession", attendanceSessionSchema);

