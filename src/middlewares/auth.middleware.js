const jwt = require("jsonwebtoken");
const User = require("../modules/users/user.model");

/**
 * Vérifie le jeton puis recharge l'utilisateur depuis la base :
 * - un compte supprimé perd immédiatement l'accès ;
 * - le rôle utilisé est celui de la base, pas celui figé dans le jeton ;
 * - un jeton émis avant un changement de mot de passe est refusé ;
 * - tant que mustChangePassword est vrai, seules les routes qui l'autorisent sont accessibles.
 */
const authenticate = ({ allowPendingPasswordChange = false } = {}) => async (req, res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Accès refusé. Token manquant." });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
  } catch {
    return res.status(401).json({ error: "Token invalide ou expiré" });
  }

  try {
    const user = await User.findById(payload.id).select("role passwordChangedAt mustChangePassword").lean();
    if (!user) return res.status(401).json({ error: "Compte introuvable." });

    if (user.passwordChangedAt && payload.iat * 1000 < new Date(user.passwordChangedAt).getTime()) {
      return res.status(401).json({ error: "Session expirée, veuillez vous reconnecter." });
    }

    req.user = {
      id: String(user._id),
      role: user.role,
      mustChangePassword: Boolean(user.mustChangePassword),
    };

    if (req.user.mustChangePassword && !allowPendingPasswordChange) {
      return res.status(403).json({
        error: "Vous devez changer votre mot de passe avant de continuer.",
        code: "PASSWORD_CHANGE_REQUIRED",
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};

const protect = authenticate();
const protectAllowingPasswordChange = authenticate({ allowPendingPasswordChange: true });

module.exports = { protect, protectAllowingPasswordChange };
