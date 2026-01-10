const mongoose = require("mongoose");

const teacherAssignmentSchema = new mongoose.Schema(
  {
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
      index: true
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true
    }
  },
  { timestamps: true }
);

// Un seul enseignant par matière et par classe
teacherAssignmentSchema.index(
  { class: 1, subject: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  "TeacherAssignment",
  teacherAssignmentSchema
);
