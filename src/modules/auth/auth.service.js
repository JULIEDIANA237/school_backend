const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../users/user.model");
const { sendEmail } = require("../../utils/mail");
const { escapeRegex } = require("../../utils/text");
const { frontendUrl } = require("../../utils/school");
const { buildSchoolEmail } = require("../../utils/schoolEmail");
const { getSchoolProfile, shortLabel } = require("../school/school.service");
const {
  assertValidPassword,
  hashPassword,
  passwordChangeTimestamp,
  normalizePhone,
} = require("../../utils/password");
const { httpError } = require("../../utils/httpError");

// Hash factice : la comparaison prend le même temps qu'un compte existe ou non.
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", 10);

const signToken = (user) =>
  jwt.sign({ id: String(user._id), role: user.role }, process.env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

/**
 * Inscription publique : crée uniquement un compte parent.
 */
const register = async (data) => {
  const email = String(data.email || "").trim().toLowerCase();
  const phone = data.phone ? normalizePhone(data.phone) : undefined;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, "Adresse email invalide.");
  assertValidPassword(data.password);

  const conditions = [{ email }];
  if (phone) conditions.push({ phone });
  if (await User.exists({ $or: conditions })) {
    throw httpError(409, "Un compte existe déjà avec cet email ou ce numéro. Utilisez « Mot de passe oublié ».");
  }

  const user = await User.create({
    email,
    phone,
    firstName: String(data.firstName || "").trim(),
    lastName: String(data.lastName || "").trim(),
    password: await hashPassword(data.password),
    role: "parent", // JAMAIS depuis le body
  });
  return user.toSafeObject();
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
  user.resetPasswordToken = crypto.createHash("sha256").update(token).digest("hex");
  user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000);
  await user.save();

  const resetUrl = new URL(
    `/auth/reset-password?token=${encodeURIComponent(token)}`,
    frontendUrl(),
  ).toString();

  try {
    const profile = await getSchoolProfile();
    const { fromName, ...email } = buildSchoolEmail(profile, {
      title: "Réinitialisation de votre mot de passe",
      greeting: user.firstName,
      paragraphs: [
        "Une demande de réinitialisation de mot de passe a été reçue pour votre compte.",
        "Ce lien expire dans une heure. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.",
      ],
      cta: { label: "Choisir un nouveau mot de passe", url: resetUrl },
    });
    await sendEmail({ to: user.email, subject: `${shortLabel(profile)} – Réinitialisation de votre mot de passe`, fromName, ...email });
  } catch (error) {
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    throw error;
  }
};

const resetPassword = async (token, newPassword) => {
  assertValidPassword(newPassword);
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

  user.password = await hashPassword(newPassword);
  user.passwordChangedAt = passwordChangeTimestamp();
  user.mustChangePassword = false;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();
};

/**
 * Connexion par email ou téléphone.
 * Plusieurs comptes peuvent partager un téléphone : on retient celui dont le mot de passe correspond.
 */
const login = async (identifier, password) => {
  if (typeof identifier !== "string" || typeof password !== "string" || !identifier.trim()) {
    throw httpError(401, "Identifiants invalides");
  }
  const id = identifier.trim();
  const conditions = [{ email: { $regex: `^${escapeRegex(id)}$`, $options: "i" } }];
  const phone = normalizePhone(id);
  if (phone) conditions.push({ phone }, { phone: id });

  const candidates = await User.find({ $or: conditions }).limit(5);
  let user = null;
  for (const candidate of candidates) {
    if (await bcrypt.compare(password, candidate.password)) {
      user = candidate;
      break;
    }
  }
  if (!candidates.length) await bcrypt.compare(password, DUMMY_HASH);
  if (!user) throw httpError(401, "Identifiants invalides");

  return { token: signToken(user), user: user.toSafeObject() };
};

module.exports = { register, login, requestPasswordReset, resetPassword, signToken };
