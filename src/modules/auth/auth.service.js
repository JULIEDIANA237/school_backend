const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../users/user.model");

/**
 * Enregistre un nouvel utilisateur
 * @param {Object} data - { email, password, firstName, lastName, role }
 */
const register = async (data) => {
  // Vérifier si l'utilisateur existe déjà
  const exists = await User.findOne({ email: data.email });
  if (exists) throw new Error("User already exists");

  // Hash du mot de passe
  const hashedPassword = await bcrypt.hash(data.password, 10);

  // Création de l'utilisateur
  const user = await User.create({
    email: data.email,
    firstName: data.firstName || "",
    lastName: data.lastName || "",
    password: hashedPassword,
    role: data.role || "parent",
  });

  // Retourner l'utilisateur sans le mot de passe
  const { password, ...userWithoutPassword } = user.toObject();
  return userWithoutPassword;
};

/**
 * Connexion d'un utilisateur
 * @param {string} email
 * @param {string} password
 */
const login = async (email, password) => {
  const user = await User.findOne({ email });
  if (!user) throw new Error("Invalid credentials");

  // Vérifier le mot de passe
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw new Error("Invalid credentials");

  // Générer le token JWT
  const token = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );

  // Retourner token + utilisateur sans mot de passe
  const { password: pwd, ...userWithoutPassword } = user.toObject();
  return { token, user: userWithoutPassword };
};

module.exports = { register, login };
