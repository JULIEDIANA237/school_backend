const VieScolaireSettings = require("./vieScolaireSettings.model");
const { httpError } = require("../../utils/httpError");

/**
 * Règlement par défaut, modifiable par l'administrateur. Les seuils s'appliquent aux heures
 * d'absence non justifiées de la période du bulletin ; 0 désactive un seuil.
 */
const DEFAULTS = {
  alertUnjustifiedHours: 6,
  alertLateCount: 3,
  warningUnjustifiedHours: 10,
  blameUnjustifiedHours: 20,
  exclusionUnjustifiedHours: 30,
  defaultSessionHours: 1,
  notifyAbsence: true,
  notifyLate: true,
  notifyIncident: true,
};

const NUMBER_FIELDS = {
  alertUnjustifiedHours: [0, 200],
  alertLateCount: [0, 100],
  warningUnjustifiedHours: [0, 400],
  blameUnjustifiedHours: [0, 400],
  exclusionUnjustifiedHours: [0, 400],
  defaultSessionHours: [0.5, 8],
};
const BOOLEAN_FIELDS = ["notifyAbsence", "notifyLate", "notifyIncident"];

const toSettings = (doc) => {
  const settings = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) {
    if (doc?.[key] !== undefined && doc[key] !== null) settings[key] = doc[key];
  }
  return settings;
};

const getSettings = async () => toSettings(await VieScolaireSettings.findOne({ key: "default" }).lean());

const updateSettings = async (body = {}) => {
  const update = {};
  for (const [key, [min, max]] of Object.entries(NUMBER_FIELDS)) {
    if (body[key] === undefined) continue;
    const value = Number(body[key]);
    if (!Number.isFinite(value) || value < min || value > max) {
      throw httpError(400, `Valeur invalide pour « ${key} » (entre ${min} et ${max}).`);
    }
    update[key] = Math.round(value * 100) / 100;
  }
  for (const key of BOOLEAN_FIELDS) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== "boolean") throw httpError(400, `Valeur invalide pour « ${key} ».`);
    update[key] = body[key];
  }

  // Avertissement < blâme < exclusion lorsque les seuils sont actifs
  const next = { ...(await getSettings()), ...update };
  const active = [next.warningUnjustifiedHours, next.blameUnjustifiedHours, next.exclusionUnjustifiedHours].filter((v) => v > 0);
  if (active.some((v, i) => i > 0 && v <= active[i - 1])) {
    throw httpError(400, "Les seuils doivent être croissants : avertissement, puis blâme, puis exclusion.");
  }

  await VieScolaireSettings.findOneAndUpdate({ key: "default" }, { $set: update }, { upsert: true });
  return getSettings();
};

const hoursText = (hours) => `${String(Math.round(hours * 100) / 100).replace(".", ",")} h`;

/**
 * Décisions de conduite proposées au conseil de classe pour une période : le niveau le plus élevé
 * atteint par les heures non justifiées, et les avertissements ou blâmes déjà prononcés.
 * @returns {{ code: "AC" | "BC" | "EC", reason: string }[]}
 */
const conductProposals = (summary, settings) => {
  if (!summary) return [];
  const proposals = new Map();
  const add = (code, reason) => proposals.set(code, [...(proposals.get(code) || []), reason]);

  const hours = summary.unjustifiedHours || 0;
  const levels = [
    ["EC", settings.exclusionUnjustifiedHours],
    ["BC", settings.blameUnjustifiedHours],
    ["AC", settings.warningUnjustifiedHours],
  ];
  const reached = levels.find(([, threshold]) => threshold > 0 && hours >= threshold);
  if (reached) add(reached[0], `${hoursText(hours)} d'absences non justifiées (seuil : ${hoursText(reached[1])})`);
  if (summary.blameCount) add("BC", `${summary.blameCount} blâme(s) de conduite prononcé(s)`);
  if (summary.warningCount) add("AC", `${summary.warningCount} avertissement(s) de conduite prononcé(s)`);

  return [...proposals].map(([code, reasons]) => ({ code, reason: reasons.join(" ; ") }));
};

module.exports = { DEFAULTS, getSettings, updateSettings, conductProposals, hoursText };
