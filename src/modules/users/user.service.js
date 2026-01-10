const UserModel = require("./user.model");

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

module.exports = {
  createUser,
  findUserByEmail,
};
