const mongoose = require("mongoose");

const { Schema, model } = mongoose;

/**
 * Un appel : une classe, un créneau (jour + heure de début) et sa durée. Seuls les élèves absents
 * ou en retard ont un AttendanceRecord ; les autres sont présents.
 */
const attendanceSessionSchema = new Schema(
  {
    class: { type: Schema.Types.ObjectId, ref: "Class", required: true },
    subject: { type: Schema.Types.ObjectId, ref: "Subject" },
    takenBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // Jour AAAA-MM-JJ dans le fuseau de l'établissement, heure HH:MM
    day: { type: String, required: true },
    startTime: { type: String, required: true },
    hours: { type: Number, required: true, min: 0.25, max: 8 },
    studentCount: { type: Number, default: 0 },
    absentCount: { type: Number, default: 0 },
    lateCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Un seul appel par classe et par créneau
attendanceSessionSchema.index({ class: 1, day: 1, startTime: 1 }, { unique: true });
attendanceSessionSchema.index({ takenBy: 1, day: -1 });
attendanceSessionSchema.index({ day: 1 });

module.exports = model("AttendanceSession", attendanceSessionSchema);
