const express = require("express");
const AuthController = require("./auth.controller");
const { createLimiter, ipAndIdentifierKey } = require("../../utils/rateLimit");

const router = express.Router();
const FIFTEEN_MINUTES = 15 * 60 * 1000;

router.post(
  "/register",
  createLimiter({ name: "register", windowMs: 60 * 60 * 1000, limit: 10 }),
  AuthController.register,
);
router.post(
  "/forgot-password",
  createLimiter({ name: "forgot-password", windowMs: FIFTEEN_MINUTES, limit: 5 }),
  AuthController.requestPasswordReset,
);
router.post(
  "/reset-password",
  createLimiter({ name: "reset-password", windowMs: FIFTEEN_MINUTES, limit: 10 }),
  AuthController.resetPassword,
);
router.post(
  "/login",
  createLimiter({
    name: "login",
    windowMs: FIFTEEN_MINUTES,
    limit: 10,
    keyGenerator: ipAndIdentifierKey,
    message: "Trop de tentatives de connexion pour ce compte. Réessayez dans 15 minutes.",
  }),
  AuthController.login,
);

module.exports = router;
