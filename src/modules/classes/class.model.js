const mongoose = require("mongoose");

const { Schema, model, Types } = mongoose;

const classSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    level: { type: String, required: true },

    // Nouveaux champs pour le système camerounais
    cycleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Cycle",
      required: true,
    },
    schoolYearId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SchoolYear",
      required: true,
    },
    serie: {
      type: String, // C, D, A4, Esp, All, etc.
    },

    students: [{ type: Types.ObjectId, ref: "Student" }],
    // Subjects sont maintenant dans la collection ClassSubject
    teachers: [{ type: Types.ObjectId, ref: "User" }],
    principalTeacher: { type: Types.ObjectId, ref: "User" },
    // Surveillant général : appels, absences, justificatifs et sanctions de la classe (un par classe,
    // qui peut suivre plusieurs classes, par exemple toutes les 6e)
    supervisor: { type: Types.ObjectId, ref: "User", index: true },

    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = model("Class", classSchema);
