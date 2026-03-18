const CycleService = require("./cycle.service");

const CycleController = {
  async getAll(req, res) {
    try {
      const cycles = await CycleService.getAllCycles();
      res.json(cycles);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
};

module.exports = CycleController;
