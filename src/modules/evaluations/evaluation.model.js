// evaluation.model.js
const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const evaluationSchema = new Schema(
  {
    name: { type: String, required: true }, // ex: "Contrôle Maths"
    subject: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    class: { type: Schema.Types.ObjectId, ref: "Class", required: true },
    period: { type: Schema.Types.ObjectId, ref: "Period", required: true },
    teacher: { type: Schema.Types.ObjectId, ref: "User", required: true },
    maxScore: { type: Number, default: 20 },
    coefficient: { type: Number, default: 1 },
    date: { type: Date, default: Date.now },
    isPublished: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = model("Evaluation", evaluationSchema);
