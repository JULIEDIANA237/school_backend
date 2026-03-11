const authorize = (...roles) => {
  return (req, res, next) => {
    console.log("====== MIDDLEWARE AUTHORIZE ======");
    console.log("Rôle utilisateur :", req.user?.role);
    console.log("Rôles autorisés :", roles);

    if (!req.user?.role) {
      console.log("❌ Aucun rôle trouvé dans req.user");
      return res.status(403).json({ message: "Accès interdit. Rôle manquant." });
    }

    if (!roles.includes(req.user.role)) {
      console.log("❌ Accès refusé. Rôle non autorisé");
      return res.status(403).json({ message: `Accès interdit. Seuls les rôles [${roles.join(", ")}] sont autorisés.` });
    }

    console.log("✅ Rôle autorisé, passage au controller");
    next();
  };
};

module.exports = { authorize };