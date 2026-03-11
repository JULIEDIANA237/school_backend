const mongoose = require("mongoose");

const gradeSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true
    },
    evaluation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Evaluation",
      required: true,
      index: true
    },
    score: {
      type: Number,
      required: true,
      min: 0
    },
    comment: {
      type: String,
      trim: true
    }
  },
  { timestamps: true }
);

// 1 note unique par élève et évaluation
gradeSchema.index({ student: 1, evaluation: 1 }, { unique: true });

module.exports = mongoose.model("Grade", gradeSchema);
