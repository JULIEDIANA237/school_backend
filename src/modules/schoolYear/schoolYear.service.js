const SchoolYear = require("./schoolYear.model");
const { httpError } = require("../../utils/httpError");

/** « 2024-2025 » : deux années consécutives. */
const assertValidName = (name) => {
  const match = /^(\d{4})-(\d{4})$/.exec(String(name || "").trim());
  if (!match || Number(match[2]) !== Number(match[1]) + 1) {
    throw httpError(400, "Le nom de l'année scolaire doit être au format AAAA-AAAA (ex : 2025-2026).");
  }
  return `${match[1]}-${match[2]}`;
};

const parseOptionalDate = (value, label) => {
  if (value === undefined || value === null || value === "") return undefined;
  const date = new Date(value);
  if (isNaN(date.getTime())) throw httpError(400, `${label} invalide.`);
  return date;
};

const buildData = (input, { partial = false } = {}) => {
  const data = {};
  if (!partial || input.name !== undefined) data.name = assertValidName(input.name);
  const startDate = parseOptionalDate(input.startDate, "Date de début");
  const endDate = parseOptionalDate(input.endDate, "Date de fin");
  if (startDate) data.startDate = startDate;
  if (endDate) data.endDate = endDate;
  if (startDate && endDate && startDate >= endDate) {
    throw httpError(400, "La date de début doit être avant la date de fin.");
  }
  if (input.isActive !== undefined) data.isActive = Boolean(input.isActive);
  return data;
};

const SchoolYearService = {
  async getAll() {
    return SchoolYear.find().sort({ name: -1 });
  },

  async getCurrent() {
    return SchoolYear.findOne({ isCurrent: true });
  },

  async create(input) {
    const data = buildData(input);
    if (await SchoolYear.exists({ name: data.name })) {
      throw httpError(409, `L'année scolaire ${data.name} existe déjà.`);
    }
    if (input.isCurrent) {
      await SchoolYear.updateMany({}, { isCurrent: false });
      data.isCurrent = true;
    }
    return SchoolYear.create(data);
  },

  /** Renommer une année met aussi à jour les périodes qui la référencent par son nom. */
  async update(id, input) {
    const year = await SchoolYear.findById(id);
    if (!year) throw httpError(404, "Année scolaire introuvable.");
    const data = buildData(input, { partial: true });

    if (data.name && data.name !== year.name) {
      if (await SchoolYear.exists({ name: data.name, _id: { $ne: id } })) {
        throw httpError(409, `L'année scolaire ${data.name} existe déjà.`);
      }
      const Period = require("../periods/period.model");
      await Period.updateMany({ year: year.name }, { year: data.name });
    }

    Object.assign(year, data);
    return year.save();
  },

  async setCurrent(id) {
    const year = await SchoolYear.findById(id);
    if (!year) throw httpError(404, "Année scolaire introuvable.");
    await SchoolYear.updateMany({ _id: { $ne: id } }, { isCurrent: false });
    year.isCurrent = true;
    year.isActive = true;
    return year.save();
  },

  async findOrCreate(name) {
    const validName = assertValidName(name);
    let year = await SchoolYear.findOne({ name: validName });
    if (!year) year = await SchoolYear.create({ name: validName });
    return year;
  },
};

module.exports = SchoolYearService;
