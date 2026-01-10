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
    coefficient: {
      type: Number,
      default: 1,
      min: 0.1
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Subject", subjectSchema);
