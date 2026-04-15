const mongoose = require("mongoose");

const subjectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    code: {
      type: String,
      required: true,
      uppercase: true,
      unique: true,
      index: true // ex: MATH, PHY, FR
    },
    principalTeacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    cycle: {
      type: String,
      enum: ["Premier cycle", "Second cycle", "Tous"],
      default: "Tous"
    },
    category: {
      type: String,
      enum: ["Littéraire", "Scientifique", "Complémentaire", "Autre"],
      default: "Autre"
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Subject", subjectSchema);
