const Period = require("./period.model");
const Evaluation = require("../evaluations/evaluation.model");
const Bulletin = require("../bulletins/bulletin.model");

// Créer une période
const createPeriod = async (data) => {
  if (new Date(data.startDate) >= new Date(data.endDate)) {
    throw new Error("Invalid period dates");
  }

  // Vérifier chevauchement sur la même année
  const overlap = await Period.findOne({
    year: data.year,
    $or: [
      {
        startDate: { $lte: data.endDate },
        endDate: { $gte: data.startDate }
      }
    ]
  });

  if (overlap) {
    throw new Error("Period dates overlap");
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

module.exports = {
  createPeriod,
  activatePeriod,
  getActivePeriod,
  getActiveYear,
  getPeriodsByYear,
  deletePeriod
};
