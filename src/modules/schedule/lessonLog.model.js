const mongoose = require("mongoose");

const { Schema, model } = mongoose;

const lessonLogSchema = new Schema(
  {
    scheduleEntryId: { type: Schema.Types.ObjectId, ref: "ScheduleEntry", default: null },
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true, index: true },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true, index: true },
    teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    schoolYearId: { type: Schema.Types.ObjectId, ref: "SchoolYear", required: true, index: true },

    date: { type: String, required: true, index: true }, // "YYYY-MM-DD"
    startTime: { type: String, required: true, trim: true }, // "HH:MM"
    endTime: { type: String, required: true, trim: true }, // "HH:MM"
    hoursDone: { type: Number, default: 1, min: 0 },

    status: {
      type: String,
      enum: ["DONE", "MISSED", "CANCELLED", "RESCHEDULED"],
      default: "DONE",
      index: true,
    },

    title: { type: String, required: true, trim: true }, // Titre de la leçon ou chapitre
    content: { type: String, default: "", trim: true }, // Résumé du cours, activités, notions abordées
    homework: { type: String, default: "", trim: true }, // Devoirs à faire
    dueDate: { type: String, default: null }, // "YYYY-MM-DD"

    // Fiche de programme officielle (assignée par le proviseur)
    chapterId: { type: Schema.Types.ObjectId, default: null, index: true },
    chapterTitle: { type: String, default: "", trim: true },
    sequenceId: { type: Schema.Types.ObjectId, ref: "Period", default: null, index: true },

    // Signature et authentification de la séance par l'enseignant
    signed: { type: Boolean, default: false, index: true },
    signedAt: { type: Date, default: null },
    signedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },

    missedReason: { type: String, default: "", trim: true },
    makeupDate: { type: String, default: null },

    attendanceSessionId: { type: Schema.Types.ObjectId, ref: "AttendanceSession", default: null },
  },
  { timestamps: true }
);

lessonLogSchema.index({ classId: 1, date: -1 });
lessonLogSchema.index({ teacherId: 1, date: -1 });
lessonLogSchema.index({ classId: 1, subjectId: 1, date: -1 });
lessonLogSchema.index({ dueDate: 1 });

module.exports = model("LessonLog", lessonLogSchema);
