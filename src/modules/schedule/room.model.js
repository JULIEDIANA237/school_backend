const mongoose = require("mongoose");

const { Schema, model } = mongoose;

const roomSchema = new Schema(
  {
    name: { type: String, required: true, trim: true }, // ex: "Salle 101", "Labo SVT"
    code: { type: String, trim: true, uppercase: true }, // ex: "S101", "LAB-SVT"
    capacity: { type: Number, default: 60, min: 1 },
    building: { type: String, trim: true }, // ex: "Bâtiment A", "Bloc Pédagogique"
    type: {
      type: String,
      enum: ["CLASSROOM", "LABORATORY", "COMPUTER_ROOM", "SPORTS", "WORKSHOP", "OTHER"],
      default: "CLASSROOM",
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

roomSchema.index({ name: 1 });
roomSchema.index({ code: 1 }, { sparse: true });

module.exports = model("Room", roomSchema);

