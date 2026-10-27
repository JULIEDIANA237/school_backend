const mongoose = require("mongoose");

const { Schema, model } = mongoose;

const lessonSchema = new Schema(
  {
    order: { type: Number, default: 1 },
    title: { type: String, required: true, trim: true }, // Titre de la leçon
    objectives: { type: String, default: "", trim: true }, // Objectifs spécifiques
    durationHours: { type: Number, default: 1, min: 0.5 }, // Durée en heures ou séances
    isCompleted: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
  },
  { _id: true }
);

const chapterSchema = new Schema(
  {
    sequenceId: { type: Schema.Types.ObjectId, ref: "Period", default: null },
    sequenceName: { type: String, default: "", trim: true }, // ex: "Séquence 1 (Sem. 1-6)"
    order: { type: Number, default: 1 },
    title: { type: String, required: true, trim: true }, // ex: "Module 1 : Alphabet & Greetings"
    objectives: { type: String, default: "", trim: true }, // Notions / compétences attendues
    estimatedSessions: { type: Number, default: 2, min: 1 }, // Nombre de séances prévues
    isCompleted: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
    sessionsDoneCount: { type: Number, default: 0 },
    lessons: [lessonSchema], // Liste des leçons composant le module
  },
  { _id: true }
);

const subjectProgramSchema = new Schema(
  {
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true, index: true },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true, index: true },
    teacherId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    schoolYearId: { type: Schema.Types.ObjectId, ref: "SchoolYear", required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null }, // Proviseur / Admin

    title: { type: String, default: "", trim: true }, // ex: "Programme Officiel d'Anglais 6e A"
    chapters: [chapterSchema],
    totalEstimatedSessions: { type: Number, default: 0 },
    notes: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

subjectProgramSchema.index({ classId: 1, subjectId: 1, schoolYearId: 1 }, { unique: true });
subjectProgramSchema.index({ teacherId: 1, schoolYearId: 1 });

module.exports = model("SubjectProgram", subjectProgramSchema);

