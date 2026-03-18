const Cycle = require("./cycle.model");

const getAllCycles = async () => {
  return await Cycle.find({ isActive: true });
};

const findOrCreateCycle = async (name) => {
  let cycle = await Cycle.findOne({ name });
  if (!cycle) {
    cycle = await Cycle.create({ name });
  }
  return cycle;
};

module.exports = {
  getAllCycles,
  findOrCreateCycle
};
