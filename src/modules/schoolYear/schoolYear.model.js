const mongoose = require("mongoose");

const schoolYearSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true, // ex: "2024-2025"
    },
    startDate: { type: Date },
    endDate: { type: Date },
    isCurrent: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SchoolYear", schoolYearSchema);
