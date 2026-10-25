const mongoose = require("mongoose");

const { Schema, model } = mongoose;

const scheduleEntrySchema = new Schema(
  {
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true, index: true },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true, index: true },
    teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    roomId: { type: Schema.Types.ObjectId, ref: "Room", default: null, index: true },
    schoolYearId: { type: Schema.Types.ObjectId, ref: "SchoolYear", required: true, index: true },

    // 1 = Lundi, 2 = Mardi, 3 = Mercredi, 4 = Jeudi, 5 = Vendredi, 6 = Samedi
    dayOfWeek: { type: Number, required: true, min: 1, max: 6, index: true },
    startTime: { type: String, required: true, trim: true }, // "HH:MM"
    endTime: { type: String, required: true, trim: true }, // "HH:MM"
    durationHours: { type: Number, default: 1, min: 0.25 },

    color: { type: String, trim: true },
    notes: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

scheduleEntrySchema.index({ classId: 1, schoolYearId: 1, dayOfWeek: 1 });
scheduleEntrySchema.index({ teacherId: 1, schoolYearId: 1, dayOfWeek: 1 });
scheduleEntrySchema.index({ roomId: 1, schoolYearId: 1, dayOfWeek: 1 });

module.exports = model("ScheduleEntry", scheduleEntrySchema);

