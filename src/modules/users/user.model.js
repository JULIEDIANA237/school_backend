const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    role: {
      type: String,
      lowercase: true,
      trim: true,
      enum: ["admin", "teacher", "parent", "student", "secretary"],
      required: true,
    },
    phone: { type: String, trim: true },
    // Mot de passe défini par un tiers (création, import, réinitialisation par l'administration) :
    // l'utilisateur doit le changer avant d'accéder au reste de l'application.
    mustChangePassword: { type: Boolean, default: false },
    // Les jetons émis avant cette date sont refusés (changement / réinitialisation du mot de passe).
    passwordChangedAt: { type: Date },
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },
    settings: {
      notifications: {
        email: { type: Boolean, default: true },
        push: { type: Boolean, default: true },
        inApp: { type: Boolean, default: true },
      },
    },
  },
  { timestamps: true }
);

userSchema.index({ phone: 1 });

/** Représentation renvoyée au client (jamais de hash ni de jeton de réinitialisation). */
userSchema.methods.toSafeObject = function toSafeObject() {
  const { password, resetPasswordToken, resetPasswordExpires, __v, ...safe } = this.toObject();
  return safe;
};

module.exports = mongoose.model("User", userSchema);
