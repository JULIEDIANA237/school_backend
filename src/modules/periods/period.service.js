const Period = require("./period.model");
const Evaluation = require("../evaluations/evaluation.model");
const Bulletin = require("../bulletins/bulletin.model");

// Créer une période
const createPeriod = async (data) => {
  const startDate = new Date(data.startDate);
  const endDate = new Date(data.endDate);

  if (startDate >= endDate) {
    throw new Error("Invalid period dates");
  }

  // Si c'est une Séquence, vérifier qu'elle est dans le Trimestre parent
  if (data.type === "SEQUENCE" && data.parentPeriod) {
    const parent = await Period.findById(data.parentPeriod);
    if (!parent) {
      throw new Error("Parent period not found");
    }

    if (startDate < new Date(parent.startDate) || endDate > new Date(parent.endDate)) {
      throw new Error("Sequence dates must be within parent trimester dates");
    }
  }

  // Vérifier chevauchement sur la même année ET LE MÊME TYPE
  // On utilise des inégalités strictes pour permettre aux périodes de se "toucher"
  // (ex: l'une finit le 01/06 et l'autre commence le 01/06)
  const overlap = await Period.findOne({
    year: data.year,
    type: data.type,
    startDate: { $lt: endDate },
    endDate: { $gt: startDate }
  });

  if (overlap) {
    throw new Error(`Period dates overlap with existing period: "${overlap.name}"`);
  }

  return await Period.create(data);
};

// Activer une période (UNE SEULE active par année)
const activatePeriod = async (periodId) => {
  const period = await Period.findById(periodId);
  if (!period) {
    throw new Error("Period not found");
  }

  await Period.updateMany(
    { year: period.year },
    { isActive: false }
  );

  period.isActive = true;
  await period.save();

  return period;
};

// 🔥 NOUVEAU : récupérer la période active globale
const getActivePeriod = async () => {
  const period = await Period.findOne({ isActive: true });

  if (!period) {
    throw new Error("No active period found");
  }

  return period;
};

// 🔥 NOUVEAU : récupérer l’année active
const getActiveYear = async () => {
  const period = await getActivePeriod();
  return period.year;
};

// Liste des périodes par année
const getPeriodsByYear = async (year) => {
  if (!year) throw new Error("Year is required");
  return await Period.find({ year }).sort({ startDate: 1 });
};

// Supprimer une période
const deletePeriod = async (periodId) => {
  const used =
    (await Evaluation.exists({ period: periodId })) ||
    (await Bulletin.exists({ period: periodId }));

  if (used) {
    throw new Error("Cannot delete a used period");
  }

  return await Period.findByIdAndDelete(periodId);
};

const getPeriodsByActiveYear = async () => {
  const activePeriod = await getActivePeriod();
  return await getPeriodsByYear(activePeriod.year);
};

module.exports = {
  createPeriod,
  activatePeriod,
  getActivePeriod,
  getActiveYear,
  getPeriodsByYear,
  getPeriodsByActiveYear,
  deletePeriod
};
