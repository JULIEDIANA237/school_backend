const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    matricule: { type: String, required: true, trim: true },
    dateOfBirth: { type: Date, required: true },

    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
      index: true
    },

    parents: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        index: true
      }
    ],

    photo: String,
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

studentSchema.index({ lastName: 1, firstName: 1 });

module.exports = mongoose.model("Student", studentSchema);
