const AuthService = require("./auth.service");

/**
 * Enregistrer un nouvel utilisateur
 */
const register = async (req, res) => {
  try {
    const { email, password, firstName, lastName, role } = req.body;

    // Vérification minimale côté serveur
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const user = await AuthService.register({ email, password, firstName, lastName, role });

    res.status(201).json({
      message: "User registered successfully",
      user,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

/**
 * Connexion d'un utilisateur
 */
const login = async (req, res) => {
  try {
    console.log("🟡 LOGIN BACKEND - BODY", req.body);
    console.log("🟡 LOGIN BACKEND - HEADERS", req.headers);

    const { email, password } = req.body;

    const result = await AuthService.login(email, password);

    console.log("🟢 LOGIN BACKEND - SUCCESS", result.user.email);

    res.json({
      message: "Login successful",
      token: result.token,
      user: result.user,
    });
  } catch (error) {
    console.error("🔴 LOGIN BACKEND ERROR", error.message);
    res.status(401).json({ error: error.message });
  }
};


module.exports = { register, login };
