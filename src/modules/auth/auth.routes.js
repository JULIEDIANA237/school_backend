const express = require("express");
const { rateLimit } = require("express-rate-limit");
const AuthController = require("./auth.controller");

const router = express.Router();

router.post("/register", AuthController.register);
router.post(
  "/forgot-password",
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false }),
  AuthController.requestPasswordReset,
);
router.post(
  "/reset-password",
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false }),
  AuthController.resetPassword,
);
router.post("/login", AuthController.login);

module.exports = router;
