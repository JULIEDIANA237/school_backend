const User = require("./user.model");
const userService = require("./user.service");
const bcrypt = require("bcryptjs");

const crypto = require("crypto"); // si vous passez à un mot de passe temporaire plus tard
const PROFILE_FIELDS = ["firstName", "lastName", "email", "phone"];
const ROLES = ["admin", "teacher", "parent", "student", "secretary"];
const pick = (obj = {}, keys) =>
  Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));
const clean = (data) => {
  if (data.email) data.email = String(data.email).trim().toLowerCase();
  return data;
};

const getAll = async (req, res) => {
  const { role } = req.query;
  
  if (req.user.role === 'secretary') {
    if (role && role !== 'parent' && role !== 'student' && role !== 'teacher') {
      return res.status(403).json({ error: "Non autorisé à voir ces utilisateurs" });
    }
    const filter = role ? { role } : { role: { $in: ['parent', 'student', 'teacher'] } };
    return res.json(await User.find(filter).select("-password"));
  }

  const filter = role ? { role } : {};
  res.json(await User.find(filter).select("-password"));
};

const getOne = async (req, res) => {
  const user = await User.findById(req.params.id).select("-password");
  if (!user) return res.status(404).json({ error: "Utilisateur non trouvé" });
  if (req.user.role === 'secretary' && user.role !== 'parent' && user.role !== 'student') {
    return res.status(403).json({ error: "Non autorisé" });
  }
  res.json(user);
};

const update = async (req, res) => {
  const target = await User.findById(req.params.id);
  if (!target) return res.status(404).json({ error: "Utilisateur non trouvé" });
  if (req.user.role === "secretary" && !["parent", "student"].includes(target.role)) {
    return res.status(403).json({ error: "Non autorisé à modifier cet utilisateur" });
  }
  const data = clean(pick(req.body, PROFILE_FIELDS));
  if (req.user.role === "admin" && ROLES.includes(req.body.role)) data.role = req.body.role;
  if (typeof req.body.password === "string" && req.body.password.length >= 8) {
    data.password = await bcrypt.hash(req.body.password, 10);
  }
  const updated = await User.findByIdAndUpdate(req.params.id, { $set: data }, { new: true, runValidators: true }).select("-password");
  res.json(updated);
};

const remove = async (req, res) => {
  const targetUser = await User.findById(req.params.id);
  if (!targetUser) return res.status(404).json({ error: "Utilisateur non trouvé" });
  if (req.user.role === 'secretary' && targetUser.role !== 'parent' && targetUser.role !== 'student') {
    return res.status(403).json({ error: "Non autorisé à supprimer cet utilisateur" });
  }
  await User.findByIdAndDelete(req.params.id);
  res.json({ message: "Utilisateur supprimé" });
};

const updateMe = async (req, res) => {
  try {
    const user = await userService.updateUser(req.user.id, clean(pick(req.body, PROFILE_FIELDS)));
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const create = async (req, res) => {
  try {
    const role = req.user.role === "secretary" ? "parent" : req.body.role;
    if (!ROLES.includes(role)) return res.status(400).json({ error: "Rôle invalide" });
    if (req.user.role === "secretary" && req.body.role && req.body.role !== "parent") {
      return res.status(403).json({ error: "Une secrétaire ne peut créer que des comptes parents." });
    }
    const hashed = await bcrypt.hash(req.body.password || "EduFlow@2025", 10);
    const user = await userService.createUser({ ...clean(pick(req.body, PROFILE_FIELDS)), role, password: hashed });
    const { password, ...safe } = user.toObject();
    res.status(201).json(safe);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: "Tous les champs sont requis" });
    }
    const result = await userService.changePassword(req.user.id, oldPassword, newPassword);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const importTeachers = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Fichier requis" });
    const result = await userService.importTeachersFromExcel(req.file.buffer);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getAll,
  getOne,
  create,
  update,
  remove,
  updateMe,
  changePassword,
  importTeachers,
};
