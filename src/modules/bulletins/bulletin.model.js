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
        average: Number,
        rank: Number
      }
    ],

    generalAverage: Number,
    rank: Number,
    teacherComment: String,
    principalComment: String,
    isPublished: { type: Boolean, default: false }
  },
  { timestamps: true }
);

// Un bulletin unique par élève et période
bulletinSchema.index({ student: 1, period: 1 }, { unique: true });

module.exports = model("Bulletin", bulletinSchema);
