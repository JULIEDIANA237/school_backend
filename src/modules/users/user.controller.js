import User from "./user.model.js";

export const getAll = async (_, res) =>
  res.json(await User.find().select("-password"));

export const getOne = async (req, res) =>
  res.json(await User.findById(req.params.id).select("-password"));

export const update = async (req, res) =>
  res.json(await User.findByIdAndUpdate(req.params.id, req.body, { new: true }));

export const remove = async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ message: "Utilisateur supprimé" });
};
