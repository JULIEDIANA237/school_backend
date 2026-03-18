const User = require("./user.model");
const userService = require("./user.service");
const bcrypt = require("bcryptjs");

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
  const targetUser = await User.findById(req.params.id);
  if (!targetUser) return res.status(404).json({ error: "Utilisateur non trouvé" });
  if (req.user.role === 'secretary' && targetUser.role !== 'parent' && targetUser.role !== 'student') {
    return res.status(403).json({ error: "Non autorisé à modifier cet utilisateur" });
  }
  res.json(await User.findByIdAndUpdate(req.params.id, req.body, { new: true }).select("-password"));
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
    const user = await userService.updateUser(req.user.id, req.body);
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const create = async (req, res) => {
  try {
    if (req.user.role === 'secretary' && req.body.role !== 'parent') {
      return res.status(403).json({ error: "Une secrétaire ne peut créer que des comptes parents." });
    }
    const { password, ...rest } = req.body;
    const hashedPassword = await bcrypt.hash(password || "EduFlow@2025", 10);
    const user = await userService.createUser({ ...rest, password: hashedPassword });
    res.status(201).json(user);
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
