const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../users/user.model");

/**
 * Enregistre un nouvel utilisateur
 * @param {Object} data - { email, password, firstName, lastName, role }
 */
const register = async (data) => {
  // Vérifier si l'utilisateur existe déjà
  const exists = await User.findOne({ 
    $or: [
      { email: data.email.toLowerCase() },
      { phone: data.phone }
    ]
  });
  if (exists) throw new Error("User already exists");

  // Hash du mot de passe
  const hashedPassword = await bcrypt.hash(data.password, 10);

  // Création de l'utilisateur
  const user = await User.create({
    email: data.email.toLowerCase(),
    firstName: data.firstName || "",
    lastName: data.lastName || "",
    password: hashedPassword,
    role: data.role || "parent",
    phone: data.phone
  });

  // Retourner l'utilisateur sans le mot de passe
  const { password, ...userWithoutPassword } = user.toObject();
  return userWithoutPassword;
};

/**
 * Connexion d'un utilisateur
 * @param {string} identifier (email or phone)
 * @param {string} password
 */
const login = async (identifier, password) => {
  const user = await User.findOne({
    $or: [
      { email: identifier.toLowerCase() },
      { phone: identifier }
    ]
  });
  
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
