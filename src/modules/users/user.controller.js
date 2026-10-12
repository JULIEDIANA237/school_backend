const User = require("./user.model");
const userService = require("./user.service");
const { signToken } = require("../auth/auth.service");
const { sendError, httpError } = require("../../utils/httpError");
const {
  assertValidPassword,
  hashPassword,
  passwordChangeTimestamp,
  generateTemporaryPassword,
  normalizePhone,
} = require("../../utils/password");

const PROFILE_FIELDS = ["firstName", "lastName", "email", "phone"];
const ROLES = ["admin", "teacher", "parent", "student", "secretary"];
const SECRETARY_VISIBLE_ROLES = ["parent", "student", "teacher"];
const SECRETARY_EDITABLE_ROLES = ["parent", "student"];

const pick = (obj = {}, keys) =>
  Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));

const clean = (data) => {
  if (data.email !== undefined) data.email = String(data.email).trim().toLowerCase();
  if (data.phone !== undefined) data.phone = normalizePhone(data.phone) || undefined;
  if (data.firstName !== undefined) data.firstName = String(data.firstName).trim();
  if (data.lastName !== undefined) data.lastName = String(data.lastName).trim();
  return data;
};

const getAll = async (req, res) => {
  const { role } = req.query;
  if (role !== undefined && !ROLES.includes(role)) return res.status(400).json({ error: "Rôle invalide" });

  let filter = role ? { role } : {};
  if (req.user.role === "secretary") {
    if (role && !SECRETARY_VISIBLE_ROLES.includes(role)) {
      return res.status(403).json({ error: "Non autorisé à voir ces utilisateurs" });
    }
    filter = role ? { role } : { role: { $in: SECRETARY_VISIBLE_ROLES } };
  }
  res.json(await User.find(filter).select("-password").sort({ lastName: 1, firstName: 1 }));
};

const getMe = async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: "Utilisateur non trouvé" });
  res.json(user.toSafeObject());
};

const getOne = async (req, res) => {
  const user = await User.findById(req.params.id).select("-password");
  if (!user) return res.status(404).json({ error: "Utilisateur non trouvé" });
  if (req.user.role === "secretary" && !SECRETARY_VISIBLE_ROLES.includes(user.role)) {
    return res.status(403).json({ error: "Non autorisé" });
  }
  res.json(user);
};

const update = async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: "Utilisateur non trouvé" });
    if (req.user.role === "secretary" && !SECRETARY_EDITABLE_ROLES.includes(target.role)) {
      return res.status(403).json({ error: "Non autorisé à modifier cet utilisateur" });
    }

    const data = clean(pick(req.body, PROFILE_FIELDS));
    if (req.user.role === "admin" && ROLES.includes(req.body.role) && req.body.role !== target.role) {
      if (String(target._id) === req.user.id) throw httpError(400, "Vous ne pouvez pas modifier votre propre rôle.");
      data.role = req.body.role;
    }

    // Réinitialisation par l'administration : mot de passe fourni ou provisoire généré.
    let temporaryPassword;
    if (req.body.generateTemporaryPassword === true) {
      temporaryPassword = generateTemporaryPassword();
    } else if (typeof req.body.password === "string" && req.body.password !== "") {
      assertValidPassword(req.body.password);
      temporaryPassword = req.body.password;
    }
    if (temporaryPassword) {
      data.password = await hashPassword(temporaryPassword);
      data.passwordChangedAt = passwordChangeTimestamp();
      data.mustChangePassword = true;
    }

    const updated = await userService.updateUser(req.params.id, data);
    res.json(req.body.generateTemporaryPassword === true ? { ...updated, temporaryPassword } : updated);
  } catch (err) {
    sendError(res, err);
  }
};

const remove = async (req, res) => {
  const targetUser = await User.findById(req.params.id);
  if (!targetUser) return res.status(404).json({ error: "Utilisateur non trouvé" });
  if (String(targetUser._id) === req.user.id) {
    return res.status(400).json({ error: "Vous ne pouvez pas supprimer votre propre compte." });
  }
  if (req.user.role === "secretary" && !SECRETARY_EDITABLE_ROLES.includes(targetUser.role)) {
    return res.status(403).json({ error: "Non autorisé à supprimer cet utilisateur" });
  }

  // Nettoyage des références pour ne pas laisser d'accès ou de liens orphelins.
  const Student = require("../students/student.model");
  const TeacherAssignment = require("../teachers/teacherAssignment.model");
  const Class = require("../classes/class.model");
  const Notification = require("../notifications/notification.model");
  await Promise.all([
    Student.updateMany({ parents: targetUser._id }, { $pull: { parents: targetUser._id } }),
    TeacherAssignment.deleteMany({ teacherId: targetUser._id }),
    Class.updateMany({ principalTeacher: targetUser._id }, { $unset: { principalTeacher: 1 } }),
    Notification.deleteMany({ user: targetUser._id }),
  ]);
  await User.findByIdAndDelete(req.params.id);
  res.json({ message: "Utilisateur supprimé" });
};

const updateMe = async (req, res) => {
  try {
    const user = await userService.updateUser(req.user.id, clean(pick(req.body, PROFILE_FIELDS)));
    res.json(user);
  } catch (err) {
    sendError(res, err);
  }
};

/**
 * Création par l'administration ou le secrétariat. Sans mot de passe fourni, un mot de
 * passe provisoire est généré et renvoyé une seule fois dans `temporaryPassword`.
 */
const create = async (req, res) => {
  try {
    const role = req.user.role === "secretary" ? "parent" : req.body.role;
    if (!ROLES.includes(role)) return res.status(400).json({ error: "Rôle invalide" });
    if (req.user.role === "secretary" && req.body.role && req.body.role !== "parent") {
      return res.status(403).json({ error: "Une secrétaire ne peut créer que des comptes parents." });
    }

    const data = clean(pick(req.body, PROFILE_FIELDS));
    if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      return res.status(400).json({ error: "Adresse email invalide." });
    }

    let temporaryPassword;
    if (typeof req.body.password === "string" && req.body.password !== "") {
      assertValidPassword(req.body.password);
      temporaryPassword = req.body.password;
    } else {
      temporaryPassword = generateTemporaryPassword();
    }

    const user = await userService.createUser({
      ...data,
      role,
      password: await hashPassword(temporaryPassword),
      mustChangePassword: true,
    });
    res.status(201).json({
      ...user.toSafeObject(),
      temporaryPassword: req.body.password ? undefined : temporaryPassword,
    });
  } catch (err) {
    sendError(res, err);
  }
};

const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body || {};
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: "Tous les champs sont requis" });
    }
    const user = await userService.changePassword(req.user.id, oldPassword, newPassword);
    // Les anciens jetons sont invalidés : on renvoie un nouveau jeton pour la session courante.
    res.json({ message: "Mot de passe mis à jour avec succès", token: signToken(user), user: user.toSafeObject() });
  } catch (err) {
    sendError(res, err);
  }
};

const importTeachers = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Fichier requis" });
    const result = await userService.importTeachersFromExcel(req.file.buffer);
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
};

module.exports = {
  getAll,
  getMe,
  getOne,
  create,
  update,
  remove,
  updateMe,
  changePassword,
  importTeachers,
};
