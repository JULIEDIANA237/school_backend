const UserModel = require("./user.model");
const bcrypt = require("bcrypt");

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

module.exports = {
  createUser,
  findUserByEmail,
  updateUser,
  changePassword,
};
