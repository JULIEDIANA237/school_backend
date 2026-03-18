const SchoolYear = require("./schoolYear.model");

const SchoolYearService = {
  async getAll() {
    return await SchoolYear.find().sort({ name: -1 });
  },

  async getCurrent() {
    return await SchoolYear.findOne({ isCurrent: true });
  },

  async create(data) {
    if (data.isCurrent) {
      await SchoolYear.updateMany({}, { isCurrent: false });
    }
    return await SchoolYear.create(data);
  },

  async findOrCreate(name) {
    let year = await SchoolYear.findOne({ name });
    if (!year) {
      year = await SchoolYear.create({ name });
    }
    return year;
  }
};

module.exports = SchoolYearService;
