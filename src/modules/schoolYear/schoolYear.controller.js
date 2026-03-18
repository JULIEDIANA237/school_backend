const SchoolYearService = require("./schoolYear.service");

const SchoolYearController = {
  async getAll(req, res) {
    try {
      const years = await SchoolYearService.getAll();
      res.json(years);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },

  async getCurrent(req, res) {
    try {
      const year = await SchoolYearService.getCurrent();
      res.json(year);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },

  async create(req, res) {
    try {
      const year = await SchoolYearService.create(req.body);
      res.status(201).json(year);
    } catch (err) {
      res.status(400).json({ message: err.message });
    }
  }
};

module.exports = SchoolYearController;
