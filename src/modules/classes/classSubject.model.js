const mongoose = require("mongoose");

const { Schema, model, Types } = mongoose;

const classSubjectSchema = new Schema(
  {
    classId: { 
      type: Types.ObjectId, 
      ref: "Class", 
      required: true 
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
    },
    schoolYearId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SchoolYear",
      required: true,
    },
    coefficient: {
      type: Number,
      required: true,
    },
    group: {
      type: Number,
      default: 1,
    },
  },
  { timestamps: true }
);

// Unique par classe, matière et année scolaire
classSubjectSchema.index({ classId: 1, subjectId: 1, schoolYearId: 1 }, { unique: true });

module.exports = model("ClassSubject", classSubjectSchema);
