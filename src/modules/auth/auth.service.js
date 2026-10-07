const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../users/user.model");
const { sendEmail } = require("../../utils/mail");

const USER_ROLES = ["admin", "teacher", "parent", "student", "secretary"];
const normalizeRole = (role) =>
  typeof role === "string" ? role.trim().toLowerCase() : "";
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Enregistre un nouvel utilisateur
 * @param {Object} data - { email, password, firstName, lastName, role }
 */
const register = async (data) => {
  const email = String(data.email || "").trim().toLowerCase();
  const phone = data.phone ? String(data.phone).trim() : undefined;
  if (!email || typeof data.password !== "string" || data.password.length < 8) {
    throw new Error("Données invalides");
  }
  const conditions = [{ email }];
  if (phone) conditions.push({ phone });
  if (await User.findOne({ $or: conditions })) throw new Error("User already exists");

  const user = await User.create({
    email,
    phone,
    firstName: data.firstName || "",
    lastName: data.lastName || "",
    password: await bcrypt.hash(data.password, 10),
    role: "parent", // JAMAIS depuis le body
  });
  const { password, ...safe } = user.toObject();
  return safe;
};

const requestPasswordReset = async (email) => {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findOne({
    email: { $regex: `^${escapeRegex(normalizedEmail)}$`, $options: "i" },
  });

  if (!user) return;

  if (
    !process.env.MAIL_USER ||
    !process.env.MAIL_PASS ||
    process.env.MAIL_USER === "your_email@gmail.com"
  ) {
    const error = new Error("Password reset email is not configured.");
    error.code = "MAIL_NOT_CONFIGURED";
    throw error;
  }

  const token = crypto.randomBytes(32).toString("hex");
  user.resetPasswordToken = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
  user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000);
  await user.save();

  const resetUrl = new URL(
    `/auth/reset-password?token=${encodeURIComponent(token)}`,
    process.env.FRONTEND_URL || "http://localhost:8080",
  ).toString();

  try {
    await sendEmail({
      to: user.email,
      subject: "Réinitialisation de votre mot de passe EduFlow",
      text: `Pour choisir un nouveau mot de passe, ouvrez ce lien (valable une heure) : ${resetUrl}`,
      html: `<p>Une demande de réinitialisation de mot de passe a été reçue.</p><p><a href="${resetUrl}">Choisir un nouveau mot de passe</a></p><p>Ce lien expire dans une heure. Si vous n’êtes pas à l’origine de cette demande, ignorez cet email.</p>`,
    });
  } catch (error) {
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    throw error;
  }
};

const resetPassword = async (token, newPassword) => {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const user = await User.findOne({
    resetPasswordToken: tokenHash,
    resetPasswordExpires: { $gt: new Date() },
  }).select("+resetPasswordToken +resetPasswordExpires");

  if (!user) {
    const error = new Error("Le lien de réinitialisation est invalide ou expiré.");
    error.code = "INVALID_RESET_TOKEN";
    throw error;
  }

  user.password = await bcrypt.hash(newPassword, 10);
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();
};

/**
 * Connexion d'un utilisateur
 * @param {string} identifier (email or phone)
 * @param {string} password
 */
const login = async (identifier, password) => {
  if (typeof identifier !== "string" || typeof password !== "string") {
    throw new Error("Invalid credentials");
  }
  const id = identifier.trim();
  const user = await User.findOne({ $or: [{ email: id.toLowerCase() }, { phone: id }] });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new Error("Invalid credentials");
  }
  const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
  const { password: _pw, ...safe } = user.toObject();
  return { token, user: safe };
};

module.exports = { register, login, requestPasswordReset, resetPassword };
