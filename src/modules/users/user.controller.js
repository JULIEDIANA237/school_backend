const User = require("./user.model");
const userService = require("./user.service");

const getAll = async (req, res) => {
  const { role } = req.query;
  const filter = role ? { role } : {};
  res.json(await User.find(filter).select("-password"));
};

const getOne = async (req, res) =>
  res.json(await User.findById(req.params.id).select("-password"));

const update = async (req, res) =>
  res.json(await User.findByIdAndUpdate(req.params.id, req.body, { new: true }));

const remove = async (req, res) => {
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

module.exports = {
  getAll,
  getOne,
  create,
  update,
  remove,
  updateMe,
  changePassword,
};
