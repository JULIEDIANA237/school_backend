const PeriodService = require("./period.service");

const PeriodController = {
  async create(req, res) {
    try {
      const period = await PeriodService.createPeriod(req.body);
      res.status(201).json(period);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async update(req, res) {
    try {
      const period = await PeriodService.updatePeriod(req.params.periodId, req.body);
      res.status(200).json(period);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async activate(req, res) {
    try {
      const { periodId } = req.body;
      const period = await PeriodService.toggleActivation(periodId);
      res.status(200).json(period);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // 🔥 plus besoin de year
  async getActive(req, res) {
    try {
      const period = await PeriodService.getActivePeriod();
      res.json(period);
    } catch (error) {
      res.status(404).json({ error: error.message });
    }
  },

  async getActiveYearPeriods(req, res) {
    try {
      const periods = await PeriodService.getPeriodsByActiveYear();
      res.json(periods);
    } catch (error) {
      res.status(404).json({ error: error.message });
    }
  },

  async getAll(req, res) {
    try {
      const periods = await PeriodService.getAllPeriods();
      res.json(periods);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async list(req, res) {
    const periods = await PeriodService.getPeriodsByYear(req.params.year);
    res.json(periods);
  },

  async remove(req, res) {
    try {
      await PeriodService.deletePeriod(req.params.periodId);
      res.json({ message: "Période supprimée" });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
};

module.exports = PeriodController;
