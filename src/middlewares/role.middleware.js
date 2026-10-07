const authorize = (...roles) => (req, res, next) => {
  if (!req.user?.role) return res.status(403).json({ message: "Accès interdit." });
  if (!roles.includes(req.user.role)) return res.status(403).json({ message: "Accès interdit." });
  next();
};


module.exports = { authorize };