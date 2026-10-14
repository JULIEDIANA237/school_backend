const mongoose = require("mongoose");

const { Schema, model } = mongoose;

const RECORD_KINDS = ["absence", "late"];
const JUSTIFICATION_STATUSES = ["none", "pending", "accepted", "rejected"];

/**
 * Absence ou retard d'un élève : relevé à l'appel (source « appel ») ou saisi par la vie scolaire
 * (source « manual », par exemple une absence d'une journée entière).
 */
const attendanceRecordSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    class: { type: Schema.Types.ObjectId, ref: "Class", required: true },
    session: { type: Schema.Types.ObjectId, ref: "AttendanceSession" },
    subject: { type: Schema.Types.ObjectId, ref: "Subject" },
    day: { type: String, required: true },
    startTime: { type: String },
    kind: { type: String, enum: RECORD_KINDS, required: true },
    // Heures d'absence (0 pour un retard)
    hours: { type: Number, default: 0, min: 0, max: 12 },
    minutesLate: { type: Number, min: 0, max: 600 },
    justified: { type: Boolean, default: false },
    // Motif retenu par la vie scolaire
    reason: { type: String, trim: true, maxlength: 300 },
    // Justificatif envoyé par le parent, puis examiné par la vie scolaire
    justification: {
      status: { type: String, enum: JUSTIFICATION_STATUSES, default: "none" },
      message: { type: String, trim: true, maxlength: 1000 },
      file: { type: Schema.Types.ObjectId, ref: "JustificationFile" },
      submittedBy: { type: Schema.Types.ObjectId, ref: "User" },
      submittedAt: Date,
      reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
      reviewedAt: Date,
      reviewNote: { type: String, trim: true, maxlength: 300 },
    },
    source: { type: String, enum: ["appel", "manual"], default: "appel" },
    recordedBy: { type: Schema.Types.ObjectId, ref: "User" },
    // Événement déjà signalé aux parents : évite les doublons et permet d'envoyer une correction
    parentNotifiedKind: { type: String, enum: RECORD_KINDS },
  },
  { timestamps: true }
);

attendanceRecordSchema.index({ student: 1, day: 1 });
attendanceRecordSchema.index({ class: 1, day: 1 });
attendanceRecordSchema.index({ day: 1 });
attendanceRecordSchema.index({ "justification.status": 1 });
attendanceRecordSchema.index(
  { session: 1, student: 1 },
  { unique: true, partialFilterExpression: { session: { $type: "objectId" } } }
);

module.exports = model("AttendanceRecord", attendanceRecordSchema);
module.exports.RECORD_KINDS = RECORD_KINDS;
module.exports.JUSTIFICATION_STATUSES = JUSTIFICATION_STATUSES;
