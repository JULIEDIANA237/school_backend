const mongoose = require("mongoose");

const { Schema, model, Types } = mongoose;

const classSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    level: { type: String, required: true },
    year: { type: String, required: true },

    students: [{ type: Types.ObjectId, ref: "Student" }],
    subjects: [{ type: Types.ObjectId, ref: "Subject" }],
    teachers: [{ type: Types.ObjectId, ref: "User" }],
    principalTeacher: { type: Types.ObjectId, ref: "User" },

    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = model("Class", classSchema);
