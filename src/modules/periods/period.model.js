const mongoose = require("mongoose");

const periodSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ["TRIMESTRE", "SEQUENCE"],
      default: "SEQUENCE"
    },
    parentPeriod: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Period"
    },
    year: {
      type: String,
      required: true,
      index: true // ex: 2024-2025
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isActive: { type: Boolean, default: false }
  },
  { timestamps: true }
);

// Une période unique par nom + année
periodSchema.index({ name: 1, year: 1 }, { unique: true });

module.exports = mongoose.model("Period", periodSchema);
