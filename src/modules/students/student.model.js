const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    matricule: { type: String, required: true, trim: true }, // Used as Internal school matricule
    
    // MINESEC Integration
    matriculeMinesec: { 
      type: String, 
      required: false,
      trim: true,
      index: { unique: true, partialFilterExpression: { matriculeMinesec: { $type: "string" } } } 
    },
    statusMinesec: {
      type: String,
      enum: ['EN_ATTENTE', 'VALIDE', 'REJETE'],
      default: 'EN_ATTENTE'
    },

    // Facultative : mieux vaut un champ vide sur le bulletin qu'une date inventée
    dateOfBirth: { type: Date },
    placeOfBirth: { type: String, trim: true },
    gender: { type: String, enum: ['M', 'F'], required: false },
    isRepeating: { type: Boolean, default: false },

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

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      sparse: true,
    },

    photo: String,
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

studentSchema.index({ lastName: 1, firstName: 1 });

module.exports = mongoose.model("Student", studentSchema);
