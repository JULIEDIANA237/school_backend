const authorize = (...roles) => (req, res, next) => {
  if (!req.user?.role || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: "Accès interdit." });
  }
  next();
};

module.exports = { authorize };
