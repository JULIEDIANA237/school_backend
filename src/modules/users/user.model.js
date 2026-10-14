const mongoose = require("mongoose");

/**
 * Surveillant général : soit un compte dédié (rôle « supervisor »), soit un enseignant ou une secrétaire
 * qui cumule cette fonction (functions: ["vie_scolaire"]) tout en gardant son rôle.
 */
const STAFF_FUNCTIONS = ["vie_scolaire"];
/** Rôles qui peuvent cumuler une fonction. */
const FUNCTION_ROLES = ["teacher", "secretary"];

/** Vrai pour un surveillant général (rôle dédié ou fonction cumulée). */
const isSupervisorUser = (user) =>
  user?.role === "supervisor" || (FUNCTION_ROLES.includes(user?.role) && (user.functions || []).includes("vie_scolaire"));

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
      enum: ["admin", "teacher", "parent", "student", "secretary", "supervisor"],
      required: true,
    },
    phone: { type: String, trim: true },
    // Fonctions confiées à un membre du personnel en plus de son rôle (ex. un enseignant surveillant général)
    functions: [{ type: String, enum: STAFF_FUNCTIONS }],
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
module.exports.STAFF_FUNCTIONS = STAFF_FUNCTIONS;
module.exports.FUNCTION_ROLES = FUNCTION_ROLES;
module.exports.isSupervisorUser = isSupervisorUser;
/** Filtre MongoDB des surveillants généraux (rôle dédié ou fonction cumulée). */
module.exports.SUPERVISOR_QUERY = { $or: [{ role: "supervisor" }, { role: { $in: FUNCTION_ROLES }, functions: "vie_scolaire" }] };
