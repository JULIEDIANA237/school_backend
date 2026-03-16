// assignment.model.js
const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const assignmentSchema = new Schema(
  {
    teacher: { type: Schema.Types.ObjectId, ref: "User", required: true },
    class: { type: Schema.Types.ObjectId, ref: "Class", required: true },
    subject: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    academicYear: { type: String, required: true }
  },
  { timestamps: true }
);

// Ensure a teacher is assigned once per class/subject combination
assignmentSchema.index({ teacher: 1, class: 1, subject: 1 }, { unique: true });

module.exports = model("Assignment", assignmentSchema);
