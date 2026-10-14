const mongoose = require("mongoose");
const Period = require("../periods/period.model");
const SchoolYear = require("../schoolYear/schoolYear.model");
const { schoolDay } = require("../../utils/school");
const { httpError } = require("../../utils/httpError");

// Les jours sont des chaînes « AAAA-MM-JJ » (fuseau de l'établissement) : elles se comparent
// directement et évitent les décalages de fuseau horaire.
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const parts = (day) => day.split("-").map(Number);

const isValidDay = (day) => {
  if (typeof day !== "string" || !DAY.test(day)) return false;
  const [y, m, d] = parts(day);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

const assertDay = (day, label = "Date") => {
  if (!isValidDay(day)) throw httpError(400, `${label} invalide (format AAAA-MM-JJ).`);
  return day;
};

const shiftDay = (day, offset) => {
  const [y, m, d] = parts(day);
  return new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
};

/** « lundi 9 novembre 2026 » */
const formatDay = (day) => {
  const [y, m, d] = parts(day);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("fr-FR", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const periodRange = (period) => ({
  from: schoolDay(period.startDate),
  to: schoolDay(period.endDate),
  label: period.name,
  periodId: String(period._id),
});

const loadCurrentYear = async () => {
  const year = (await SchoolYear.findOne({ isCurrent: true }).lean()) || (await SchoolYear.findOne().sort({ name: -1 }).lean());
  const periods = year
    ? await Period.find({ year: year.name }).select("name type startDate endDate isActive parentPeriod").lean()
    : [];
  return { year, periods };
};

const yearRange = (year, periods) => {
  const label = year ? `Année ${year.name}` : "90 derniers jours";
  if (periods.length) {
    const starts = periods.map((p) => schoolDay(p.startDate)).sort();
    const ends = periods.map((p) => schoolDay(p.endDate)).sort();
    return { from: starts[0], to: ends[ends.length - 1], label, periodId: null };
  }
  if (year?.startDate && year?.endDate) {
    return { from: schoolDay(year.startDate), to: schoolDay(year.endDate), label, periodId: null };
  }
  const to = schoolDay();
  return { from: shiftDay(to, -90), to, label, periodId: null };
};

/** Plage élargie jusqu'à aujourd'hui : les absences du jour ne doivent jamais disparaître d'une liste. */
const includeToday = (range) => {
  const today = schoolDay();
  return { ...range, from: range.from > today ? today : range.from, to: range.to < today ? today : range.to };
};

/** Toute l'année scolaire en cours, jusqu'à aujourd'hui au moins (historique des parents). */
const currentYearRange = async () => {
  const { year, periods } = await loadCurrentYear();
  return includeToday(yearRange(year, periods));
};

/**
 * Période en cours : le trimestre qui contient aujourd'hui (ou celui de la séquence qui le contient).
 * Entre deux périodes (vacances, trimestre pas encore créé) : toute l'année jusqu'à aujourd'hui.
 */
const currentPeriodRange = async () => {
  const today = schoolDay();
  const { year, periods } = await loadCurrentYear();
  const contains = (p) => schoolDay(p.startDate) <= today && today <= schoolDay(p.endDate);
  const trimesters = periods.filter((p) => p.type === "TRIMESTRE");
  const trimester = trimesters.find(contains);
  if (trimester) return periodRange(trimester);
  const sequence = periods.find((p) => p.type === "SEQUENCE" && contains(p));
  if (sequence) return periodRange(trimesters.find((t) => String(t._id) === String(sequence.parentPeriod)) || sequence);
  return includeToday(yearRange(year, periods));
};

/** Plage demandée : une période, des dates explicites, ou la période en cours. */
const resolveRange = async ({ periodId, from, to } = {}) => {
  if (periodId) {
    if (!mongoose.isValidObjectId(periodId)) throw httpError(400, "Identifiant de période invalide.");
    const period = await Period.findById(periodId).lean();
    if (!period) throw httpError(404, "Période introuvable.");
    return periodRange(period);
  }
  if (from || to) {
    const range = { from: assertDay(from, "Date de début"), to: assertDay(to, "Date de fin"), label: null, periodId: null };
    if (range.from > range.to) throw httpError(400, "La date de début doit précéder la date de fin.");
    return range;
  }
  return currentPeriodRange();
};

module.exports = {
  TIME,
  isValidDay,
  assertDay,
  shiftDay,
  formatDay,
  periodRange,
  resolveRange,
  currentPeriodRange,
  currentYearRange,
  loadCurrentYear,
};
