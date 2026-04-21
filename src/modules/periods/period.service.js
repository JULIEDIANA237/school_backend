const Period = require("./period.model");
const SchoolYear = require("../schoolYear/schoolYear.model");
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

// Mettre à jour une période
const updatePeriod = async (periodId, data) => {
  const startDate = data.startDate ? new Date(data.startDate) : null;
  const endDate = data.endDate ? new Date(data.endDate) : null;

  if (startDate && endDate && startDate >= endDate) {
    throw new Error("La date de début doit être avant la date de fin");
  }

  // Vérifier chevauchement (en excluant la période actuelle)
  if (startDate && endDate) {
    const overlap = await Period.findOne({
      _id: { $ne: periodId },
      year: data.year,
      type: data.type,
      startDate: { $lt: endDate },
      endDate: { $gt: startDate }
    });

    if (overlap) {
      throw new Error(`Ces dates chevauchent une autre période : "${overlap.name}"`);
    }
  }

  return await Period.findByIdAndUpdate(periodId, data, { new: true, runValidators: true });
};

// Activer une période (UNE SEULE active par année)
const activatePeriod = async (periodId) => {
  const period = await Period.findById(periodId);
  if (!period) {
    throw new Error("Period not found");
  }

  // Désactiver seulement les périodes du même type pour cette année
  await Period.updateMany(
    { year: period.year, type: period.type },
    { isActive: false }
  );

  // Si c'est une SÉQUENCE et qu'elle a un parent, s'assurer que le parent est actif aussi
  if (period.type === "SEQUENCE" && period.parentPeriod) {
    await Period.findByIdAndUpdate(period.parentPeriod, { isActive: true });
  }

  period.isActive = true;
  await period.save();

  return period;
};

// Toggle activation (désactive les autres si on active celle-ci)
const toggleActivation = async (periodId) => {
  const period = await Period.findById(periodId);
  if (!period) throw new Error("Period not found");

  const newState = !period.isActive;

  if (newState) {
    // Désactiver seulement les périodes du même type
    await Period.updateMany(
      { year: period.year, type: period.type }, 
      { isActive: false }
    );
    
    // Si c'est une SÉQUENCE et qu'elle a un parent, auto-activer le parent
    if (period.type === "SEQUENCE" && period.parentPeriod) {
      await Period.findByIdAndUpdate(period.parentPeriod, { isActive: true });
    }
  }

  period.isActive = newState;
  await period.save();

  return period;
};

// Récupérer la période active globale
const getActivePeriod = async () => {
  const period = await Period.findOne({ isActive: true });
  if (!period) {
    throw new Error("No active period found");
  }
  return period;
};

// Récupérer l’année active
const getActiveYear = async () => {
  try {
    const period = await getActivePeriod();
    return period.year;
  } catch (e) {
    let currentYear = await SchoolYear.findOne({ isCurrent: true });
    if (!currentYear) currentYear = await SchoolYear.findOne().sort({ createdAt: -1 });
    if (!currentYear) throw new Error("No school year found");
    return currentYear.name;
  }
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
  let year = null;
  
  // 1. Essayer de trouver une période active
  try {
    const activePeriod = await Period.findOne({ isActive: true });
    if (activePeriod) year = activePeriod.year;
  } catch (e) {}

  // 2. Fallback sur l'année scolaire marquée "isCurrent"
  if (!year) {
    let currentYear = await SchoolYear.findOne({ isCurrent: true });
    if (!currentYear) {
      currentYear = await SchoolYear.findOne().sort({ createdAt: -1 });
    }
    if (currentYear) year = currentYear.name;
  }

  if (!year) return [];

  return await getPeriodsByYear(year);
};

// Récupérer toutes les périodes confondues
const getAllPeriods = async () => {
  return await Period.find().sort({ year: -1, startDate: 1 });
};

module.exports = {
  getAllPeriods,
  createPeriod,
  activatePeriod,
  getActivePeriod,
  getActiveYear,
  getPeriodsByYear,
  getPeriodsByActiveYear,
  deletePeriod,
  toggleActivation,
  updatePeriod
};
