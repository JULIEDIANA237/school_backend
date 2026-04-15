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

  // Helper pour trouver une valeur par patterns
  const getVal = (row, patterns) => {
    const keys = Object.keys(row);
    const key = keys.find(k => {
      const normalized = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return patterns.some(p => normalized.includes(p));
    });
    return key ? row[key] : null;
  };

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    try {
      const fName = getVal(row, ['prenom']);
      const lName = getVal(row, ['nom']);
      const email = getVal(row, ['email']);
      const phone = getVal(row, ['telephone', 'tel', 'phone', 'contact']);
      const password = getVal(row, ['password', 'mot de passe']);

      if (!fName || !lName || !email) {
        // Skip empty rows
        if (!fName && !lName && !email) continue;
        throw new Error("Champs requis manquants (Nom, Prenom, Email)");
      }

      const existingUser = await UserModel.findOne({ email });
      if (existingUser) {
        // Update existing teacher if needed (e.g. update phone)
        if (!existingUser.phone && phone) {
           existingUser.phone = phone;
           await existingUser.save();
        }
        result.errors.push(`Ligne ${i + 2}: L'utilisateur avec l'email ${email} existe déjà.`);
        continue;
      }

      const passwordToHash = password ? String(password) : "EduFlow@2025";
      const hashedPassword = await bcrypt.hash(passwordToHash, 10);
      await UserModel.create({
        firstName: fName,
        lastName: lName,
        email,
        phone,
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
