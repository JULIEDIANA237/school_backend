// bulletin.model.js
const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const bulletinSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    class: { type: Schema.Types.ObjectId, ref: "Class", required: true },
    period: { type: Schema.Types.ObjectId, ref: "Period", required: true },

    averages: [
      {
        subject: { type: Schema.Types.ObjectId, ref: "Subject" },
        // null = matière non classée (aucune note sur la période)
        average: { type: Number, default: null },
        coefficient: Number,
        group: Number,
        rank: { type: Number, default: null },
        // Bulletins trimestriels : moyenne de chaque séquence du trimestre, figée au calcul
        sequenceMarks: [
          {
            _id: false,
            period: { type: Schema.Types.ObjectId, ref: "Period" },
            name: String,
            average: { type: Number, default: null },
          },
        ],
      },
    ],

    // null = élève non classé (aucune note sur la période)
    generalAverage: { type: Number, default: null },
    rank: { type: Number, default: null },
    // Nombre d'élèves classés dans la classe pour cette période (« rang x / classifiedCount »)
    classifiedCount: Number,
    teacherComment: String,
    principalComment: String,
    decisions: [String], // Pour stocker les cases cochées
    isPublished: { type: Boolean, default: false },
    publishedAt: Date,
  },
  { timestamps: true }
);

// Un bulletin unique par élève et période
bulletinSchema.index({ student: 1, period: 1 }, { unique: true });
bulletinSchema.index({ class: 1, period: 1 });

module.exports = model("Bulletin", bulletinSchema);
