const mongoose = require("mongoose");

const { Schema, model } = mongoose;

/**
 * Pièce jointe d'un justificatif (photo ou PDF), stockée à part pour que les listes d'absences
 * restent légères. À déplacer vers un stockage d'objets si les volumes grandissent.
 */
const justificationFileSchema = new Schema(
  {
    record: { type: Schema.Types.ObjectId, ref: "AttendanceRecord", required: true, index: true },
    student: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    mime: { type: String, required: true },
    size: { type: Number, required: true },
    data: { type: Buffer, required: true },
  },
  { timestamps: true }
);

module.exports = model("JustificationFile", justificationFileSchema);
