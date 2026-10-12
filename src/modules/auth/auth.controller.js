const AuthService = require("./auth.service");
const { sendError } = require("../../utils/httpError");

/**
 * Inscription publique (compte parent uniquement)
 */
const register = async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone } = req.body || {}; // pas de role
    const user = await AuthService.register({ email, password, firstName, lastName, phone });
    res.status(201).json({ message: "User registered successfully", user });
  } catch (e) {
    sendError(res, e);
  }
};

const requestPasswordReset = async (req, res) => {
  const email = req.body?.email;
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: "Adresse email invalide." });
  }

  try {
    await AuthService.requestPasswordReset(email);
  } catch (error) {
    console.error("[AUTH_PASSWORD_RESET_EMAIL_FAILURE]", {
      code: error.code || "EMAIL_SEND_FAILED",
    });
  }

  res.json({
    message:
      "Si un compte correspond à cette adresse, un lien de réinitialisation lui a été envoyé.",
  });
};

const resetPassword = async (req, res) => {
  const { token, password } = req.body || {};
  if (typeof token !== "string" || token.length !== 64 || typeof password !== "string" || password.length < 8) {
    return res.status(400).json({
      error: "Le lien est invalide ou expiré, ou le mot de passe est trop court (8 caractères minimum).",
    });
  }

  try {
    await AuthService.resetPassword(token, password);
    return res.json({ message: "Mot de passe modifié. Vous pouvez vous connecter." });
  } catch (error) {
    if (error.code === "INVALID_RESET_TOKEN") {
      return res.status(400).json({ error: error.message });
    }
    if (error.status) return sendError(res, error);
    console.error("[AUTH_PASSWORD_RESET_FAILURE]", {
      code: error.code || "PASSWORD_RESET_FAILED",
    });
    return res.status(500).json({ error: "Impossible de réinitialiser le mot de passe." });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const { token, user } = await AuthService.login(email, password);
    res.json({ message: "Login successful", token, user });
  } catch (e) {
    sendError(res, e, 401);
  }
};

module.exports = { register, login, requestPasswordReset, resetPassword };
