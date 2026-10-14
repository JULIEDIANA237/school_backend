const mongoose = require("mongoose");

const { Schema, model } = mongoose;

/** retenue (heures), exclusion temporaire (jours), avertissement et blâme de conduite. */
const INCIDENT_TYPES = ["retenue", "exclusion", "avertissement", "blame"];

const disciplineIncidentSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    class: { type: Schema.Types.ObjectId, ref: "Class", required: true },
    day: { type: String, required: true },
    type: { type: String, enum: INCIDENT_TYPES, required: true },
    hours: { type: Number, min: 0, max: 40 },
    days: { type: Number, min: 0, max: 30 },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    decidedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

disciplineIncidentSchema.index({ student: 1, day: 1 });
disciplineIncidentSchema.index({ class: 1, day: 1 });
disciplineIncidentSchema.index({ day: 1 });

module.exports = model("DisciplineIncident", disciplineIncidentSchema);
module.exports.INCIDENT_TYPES = INCIDENT_TYPES;
