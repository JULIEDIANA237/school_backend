const UserModel = require("./user.model");
const bcrypt = require("bcryptjs");

const createUser = async (data) => {
  const existingUser = await UserModel.findOne({ email: data.email });
  if (existingUser) {
    throw new Error("User already exists");
  }

  const user = new UserModel(data);
  return user.save();
};

const findUserByEmail = async (email) => {
  return UserModel.findOne({ email });
};

const updateUser = async (userId, data) => {
  const user = await UserModel.findByIdAndUpdate(
    userId,
    { $set: data },
    { new: true, runValidators: true }
  ).select("-password");
  
  if (!user) throw new Error("User not found");
  return user;
};

const changePassword = async (userId, oldPassword, newPassword) => {
  const user = await UserModel.findById(userId);
  if (!user) throw new Error("User not found");

  const isMatch = await bcrypt.compare(oldPassword, user.password);
  if (!isMatch) throw new Error("Mot de passe actuel incorrect");

  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();
  
  return { message: "Mot de passe mis à jour avec succès" };
};

const importTeachersFromExcel = async (fileBuffer) => {
  const xlsx = require("xlsx");
  const workbook = xlsx.read(fileBuffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

  const result = {
    totalRows: data.length,
    created: 0,
    errors: [],
  };

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    try {
      const fName = row.firstName || row.Prenom || row.Prénom;
      const lName = row.lastName || row.Nom;
      const email = row.email || row.Email;
      const password = row.password || row.Password || row.MotDePasse;

      if (!fName || !lName || !email) {
        // Skip empty rows
        if (!fName && !lName && !email) continue;
        throw new Error("Champs requis manquants (Nom, Prenom, Email)");
      }

      const existingUser = await UserModel.findOne({ email });
      if (existingUser) {
        // Update existing teacher if needed or skip
        result.errors.push(`Ligne ${i + 2}: L'utilisateur avec l'email ${email} existe déjà.`);
        continue;
      }

      const passwordToHash = password ? String(password) : "EduFlow@2025";
      const hashedPassword = await bcrypt.hash(passwordToHash, 10);
      await UserModel.create({
        firstName: fName,
        lastName: lName,
        email,
        password: hashedPassword,
        role: "teacher",
      });

      result.created++;
    } catch (err) {
      result.errors.push(`Ligne ${i + 2}: ${err.message}`);
    }
  }

  return result;
};

module.exports = {
  createUser,
  findUserByEmail,
  updateUser,
  changePassword,
  importTeachersFromExcel,
};
