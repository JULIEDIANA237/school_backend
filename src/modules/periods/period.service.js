const mongoose = require("mongoose");
const Period = require("./period.model");
const SchoolYear = require("../schoolYear/schoolYear.model");
const Evaluation = require("../evaluations/evaluation.model");
const Bulletin = require("../bulletins/bulletin.model");
const { httpError } = require("../../utils/httpError");

const PERIOD_FIELDS = ["name", "type", "year", "startDate", "endDate", "parentPeriod"];

const pickFields = (data = {}) =>
  Object.fromEntries(PERIOD_FIELDS.filter((k) => data[k] !== undefined).map((k) => [k, data[k]]));

const toDate = (value, label) => {
  const date = new Date(value);
  if (!value || isNaN(date.getTime())) throw httpError(400, `${label} invalide.`);
  return date;
};

/**
 * Valide une période complète (création ou état fusionné d'une mise à jour).
 * Règles : année scolaire existante, dates cohérentes, séquence rattachée à un
 * trimestre de la même année et comprise dans ses dates, pas de chevauchement.
 */
const validatePeriod = async (data, currentId = null) => {
  const name = String(data.name || "").trim();
  if (!name) throw httpError(400, "Le nom de la période est requis.");
  if (!["TRIMESTRE", "SEQUENCE"].includes(data.type)) throw httpError(400, "Type de période invalide.");
  const year = String(data.year || "").trim();
  if (!year) throw httpError(400, "L'année scolaire est requise.");
  if (!(await SchoolYear.exists({ name: year }))) {
    throw httpError(400, `Année scolaire « ${year} » inconnue. Créez-la d'abord dans « Années scolaires ».`);
  }

  const startDate = toDate(data.startDate, "Date de début");
  const endDate = toDate(data.endDate, "Date de fin");
  if (startDate >= endDate) throw httpError(400, "La date de début doit être avant la date de fin.");

  let parentPeriod = null;
  if (data.type === "SEQUENCE") {
    if (!data.parentPeriod || !mongoose.isValidObjectId(data.parentPeriod)) {
      throw httpError(400, "Une séquence doit être rattachée à un trimestre.");
    }
    const parent = await Period.findById(data.parentPeriod).lean();
    if (!parent || parent.type !== "TRIMESTRE") throw httpError(400, "Le trimestre parent est introuvable.");
    if (parent.year !== year) {
      throw httpError(400, "Le trimestre parent doit appartenir à la même année scolaire.");
    }
    if (startDate < parent.startDate || endDate > parent.endDate) {
      throw httpError(400, "Les dates de la séquence doivent être comprises dans celles du trimestre.");
    }
    parentPeriod = parent._id;
  } else if (currentId) {
    const outside = await Period.findOne({
      parentPeriod: currentId,
      $or: [{ startDate: { $lt: startDate } }, { endDate: { $gt: endDate } }],
    }).lean();
    if (outside) {
      throw httpError(400, `La séquence « ${outside.name} » sortirait des nouvelles dates du trimestre.`);
    }
  }

  const overlap = await Period.findOne({
    ...(currentId ? { _id: { $ne: currentId } } : {}),
    year,
    type: data.type,
    startDate: { $lt: endDate },
    endDate: { $gt: startDate },
  }).lean();
  if (overlap) throw httpError(400, `Ces dates chevauchent la période « ${overlap.name} ».`);

  return { name, type: data.type, year, startDate, endDate, parentPeriod };
};

const isPeriodUsed = async (periodId) =>
  !!(
    (await Evaluation.exists({ period: periodId })) ||
    (await Bulletin.exists({ period: periodId })) ||
    (await Period.exists({ parentPeriod: periodId }))
  );

const createPeriod = async (data) => Period.create(await validatePeriod(pickFields(data)));

const updatePeriod = async (periodId, data) => {
  const existing = await Period.findById(periodId).lean();
  if (!existing) throw httpError(404, "Période introuvable.");

  const changes = pickFields(data);
  const merged = { ...existing, ...changes };
  if ((changes.type && changes.type !== existing.type) || (changes.year && changes.year !== existing.year)) {
    if (await isPeriodUsed(periodId)) {
      throw httpError(409, "Impossible de changer le type ou l'année d'une période déjà utilisée.");
    }
  }

  const validated = await validatePeriod(merged, periodId);
  if (changes.endDate && new Date(changes.endDate).getTime() !== new Date(existing.endDate).getTime()) {
    validated.deadlineReminders = []; // nouvelle date de clôture : les rappels aux enseignants repartent de zéro
  }
  return Period.findByIdAndUpdate(periodId, validated, { returnDocument: "after", runValidators: true });
};

/** Vrai si la période, ou son trimestre parent, est clôturée. */
const isPeriodLocked = async (periodOrId) => {
  const period =
    periodOrId && typeof periodOrId === "object" && "isClosed" in periodOrId
      ? periodOrId
      : await Period.findById(periodOrId).select("isClosed parentPeriod").lean();
  if (!period) return false;
  if (period.isClosed) return true;
  if (!period.parentPeriod) return false;
  const parentId = period.parentPeriod._id || period.parentPeriod;
  return !!(await Period.exists({ _id: parentId, isClosed: true }));
};

const assertPeriodOpen = async (periodOrId) => {
  if (await isPeriodLocked(periodOrId)) {
    throw httpError(
      409,
      "Cette période est clôturée : les notes et les évaluations ne peuvent plus être modifiées.",
      "PERIOD_CLOSED",
    );
  }
};

const setClosure = async (periodId, isClosed) => {
  const period = await Period.findByIdAndUpdate(periodId, { isClosed: !!isClosed }, { returnDocument: "after" });
  if (!period) throw httpError(404, "Période introuvable.");
  return period;
};

/**
 * Active/désactive une période. Une seule séquence et un seul trimestre actifs à la fois ;
 * activer une séquence active son trimestre, activer un trimestre désactive les séquences
 * des autres trimestres.
 */
const toggleActivation = async (periodId) => {
  const period = await Period.findById(periodId);
  if (!period) throw httpError(404, "Période introuvable.");

  const activate = !period.isActive;
  if (activate) {
    if (period.type === "SEQUENCE") {
      await Period.updateMany({ type: "SEQUENCE", _id: { $ne: period._id } }, { isActive: false });
      if (period.parentPeriod) {
        await Period.updateMany({ type: "TRIMESTRE", _id: { $ne: period.parentPeriod } }, { isActive: false });
        await Period.updateOne({ _id: period.parentPeriod }, { isActive: true });
      }
    } else {
      await Period.updateMany({ type: "TRIMESTRE", _id: { $ne: period._id } }, { isActive: false });
      await Period.updateMany(
        { type: "SEQUENCE", isActive: true, parentPeriod: { $ne: period._id } },
        { isActive: false },
      );
    }
  } else if (period.type === "TRIMESTRE") {
    await Period.updateMany({ parentPeriod: period._id }, { isActive: false });
  }

  period.isActive = activate;
  await period.save();
  return period;
};

/** Période active de référence : la séquence active, sinon le trimestre actif. */
const findActivePeriod = async () =>
  (await Period.findOne({ isActive: true, type: "SEQUENCE" }).sort({ startDate: -1 })) ||
  (await Period.findOne({ isActive: true, type: "TRIMESTRE" }).sort({ startDate: -1 }));

const getActivePeriod = async () => {
  const period = await findActivePeriod();
  if (!period) throw httpError(404, "Aucune période active.");
  return period;
};

const findCurrentSchoolYear = async () =>
  (await SchoolYear.findOne({ isCurrent: true })) || (await SchoolYear.findOne().sort({ name: -1 }));

const getActiveYear = async () => {
  const currentYear = await SchoolYear.findOne({ isCurrent: true });
  if (currentYear) return currentYear.name;
  const active = await findActivePeriod();
  if (active) return active.year;
  const latest = await SchoolYear.findOne().sort({ name: -1 });
  if (!latest) throw httpError(404, "Aucune année scolaire.");
  return latest.name;
};

const getPeriodsByYear = async (year) => {
  if (!year) throw httpError(400, "Année requise.");
  return Period.find({ year }).sort({ startDate: 1 });
};

const deletePeriod = async (periodId) => {
  if (await isPeriodUsed(periodId)) {
    throw httpError(409, "Impossible de supprimer une période utilisée (évaluations, bulletins ou séquences rattachées).");
  }
  const deleted = await Period.findByIdAndDelete(periodId);
  if (!deleted) throw httpError(404, "Période introuvable.");
  return deleted;
};

const getPeriodsByActiveYear = async () => {
  try {
    return await getPeriodsByYear(await getActiveYear());
  } catch {
    return [];
  }
};

const getAllPeriods = async () => Period.find().sort({ year: -1, startDate: 1 });

module.exports = {
  getAllPeriods,
  createPeriod,
  updatePeriod,
  deletePeriod,
  toggleActivation,
  setClosure,
  isPeriodLocked,
  assertPeriodOpen,
  findActivePeriod,
  getActivePeriod,
  getActiveYear,
  findCurrentSchoolYear,
  getPeriodsByYear,
  getPeriodsByActiveYear,
};
