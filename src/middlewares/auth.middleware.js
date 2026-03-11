const jwt = require("jsonwebtoken");

const protect = (req, res, next) => {
  console.log("====== MIDDLEWARE PROTECT ======");
  const authHeader = req.headers.authorization;
  console.log("Authorization header reçu :", authHeader);

  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : null;

  if (!token) {
    console.log("❌ Aucun token reçu");
    return res.status(401).json({ message: "Accès refusé. Token manquant." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("✅ Token décodé :", decoded);
    req.user = decoded; // { id, role, email }
    next();
  } catch (err) {
    console.log("❌ Token invalide ou expiré :", err.message);
    return res.status(401).json({ message: "Token invalide ou expiré" });
  }
};

module.exports = { protect };