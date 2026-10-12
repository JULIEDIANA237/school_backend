const mongoose = require("mongoose");
const Subject = require("./subject.model");
const User = require("../users/user.model");
const { readFirstSheet, createColumnResolver, assertRequiredColumns } = require("../../utils/excel");
const { normalizeText } = require("../../utils/text");
const { httpError } = require("../../utils/httpError");
const { bulkWriteSafe } = require("../../utils/bulk");

const SUBJECT_FIELDS = ["name", "code", "principalTeacher", "cycle", "category", "isActive"];
const pickFields = (data = {}) =>
  Object.fromEntries(SUBJECT_FIELDS.filter((k) => data[k] !== undefined).map((k) => [k, data[k]]));

const normalizePrincipal = async (fields) => {
  if (fields.principalTeacher === undefined) return;
  if (!fields.principalTeacher) {
    fields.principalTeacher = null;
    return;
  }
  if (
    !mongoose.isValidObjectId(fields.principalTeacher) ||
    !(await User.exists({ _id: fields.principalTeacher, role: "teacher" }))
  ) {
    throw httpError(400, "Le responsable de la matière doit être un enseignant existant.");
  }
};

const createSubject = async (data) => {
  const fields = pickFields(data);
  await normalizePrincipal(fields);
  return Subject.create(fields);
};

const updateSubject = async (id, data) => {
  if (!mongoose.isValidObjectId(id)) throw httpError(400, "Identifiant invalide.");
  const fields = pickFields(data);
  await normalizePrincipal(fields);
  const subject = await Subject.findByIdAndUpdate(id, fields, { returnDocument: "after", runValidators: true });
  if (!subject) throw httpError(404, "Matière introuvable.");
  return subject;
};

const getActiveSubjects = async () =>
  Subject.find({ isActive: true }).populate("principalTeacher", "firstName lastName").sort({ name: 1 });

// Désactiver une matière (suppression douce : l'historique reste lisible)
const disableSubject = async (id) => {
  if (!mongoose.isValidObjectId(id)) throw httpError(400, "Identifiant invalide.");
  const subject = await Subject.findByIdAndUpdate(id, { isActive: false }, { returnDocument: "after" });
  if (!subject) throw httpError(404, "Matière introuvable.");
  return subject;
};

const getSubjectByCode = async (code) => Subject.findOne({ code: String(code).toUpperCase() });

const SUBJECT_COLUMNS = {
  name: ["nom", "name", "matiere", "nom de la matiere", "subject"],
  code: ["code", "code matiere"],
  cycle: ["cycle"],
  category: ["categorie", "category"],
};

const mapCycle = (input) => {
  const text = normalizeText(input);
  if (text.includes("premier") || /^1/.test(text)) return "Premier cycle";
  if (text.includes("second") || /^2/.test(text)) return "Second cycle";
  return "Tous";
};

const mapCategory = (input) => {
  const text = normalizeText(input);
  if (text.includes("litt")) return "Littéraire";
  if (text.includes("scient")) return "Scientifique";
  if (text.includes("comp")) return "Complémentaire";
  return "Autre";
};

/**
 * Import des matières. Une matière existante (même code) est mise à jour et réactivée ;
 * son responsable n'est pas modifié. Un code généré qui entre en conflit avec une autre
 * matière est signalé au lieu d'écraser celle-ci.
 */
const importSubjectsFromExcel = async (fileBuffer) => {
  const rows = readFirstSheet(fileBuffer);
  const columns = createColumnResolver(rows, SUBJECT_COLUMNS);
  assertRequiredColumns(columns, ["name"], { name: "Nom" });

  const result = { totalRows: rows.length, created: 0, errors: [] };
  const seenCodes = new Map();
  const existingByCode = new Map((await Subject.find({}, { name: 1, code: 1 }).lean()).map((s) => [s.code, s]));
  const pending = new Map(); // code -> { line, op } : la dernière ligne d'un même code l'emporte

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const line = `Ligne ${i + 2}`;
    try {
      const name = columns.get(row, "name") ? String(columns.get(row, "name")).trim() : null;
      if (!name) {
        if (Object.values(row).some((v) => v !== null && v !== "")) throw new Error("Nom de la matière requis");
        continue;
      }
      const explicitCode = columns.get(row, "code");
      const code = String(explicitCode || normalizeText(name).replace(/\s+/g, "").slice(0, 4)).toUpperCase();
      if (!code) throw new Error("Code de la matière requis");

      if (seenCodes.has(code) && seenCodes.get(code) !== normalizeText(name)) {
        throw new Error(`Le code ${code} est déjà utilisé par une autre matière du fichier : ajoutez une colonne « Code ».`);
      }
      seenCodes.set(code, normalizeText(name));

      const existing = existingByCode.get(code);
      if (existing && !explicitCode && normalizeText(existing.name) !== normalizeText(name)) {
        throw new Error(`Le code généré ${code} appartient déjà à « ${existing.name} » : précisez un code.`);
      }

      pending.set(code, { line, op: {
        updateOne: {
          filter: { code },
          update: {
            $set: {
              name,
              code,
              cycle: mapCycle(columns.get(row, "cycle") || "Tous"),
              category: mapCategory(columns.get(row, "category") || "Autre"),
              isActive: true,
            },
          },
          upsert: true,
        },
      } });
    } catch (err) {
      result.errors.push(`${line}: ${err.message}`);
    }
  }

  const entries = [...pending.values()];
  const failed = await bulkWriteSafe(Subject, entries.map((e) => e.op));
  failed.forEach((f) => result.errors.push(`${entries[f.index].line}: ${f.message}`));
  result.created = entries.length - failed.length;
  return result;
};

/**
 * Recherche de matière en mémoire (nom exact sans tenir compte de la casse, ou code),
 * chargée en une seule requête pour les imports.
 */
const loadSubjectLookup = async () => {
  const subjects = await Subject.find({}).lean();
  const byName = new Map(subjects.map((s) => [String(s.name).trim().toLowerCase(), s]));
  const byCode = new Map(subjects.map((s) => [String(s.code).toUpperCase(), s]));
  return (input) => {
    const text = String(input ?? "").trim();
    return byName.get(text.toLowerCase()) || byCode.get(text.toUpperCase()) || null;
  };
};

module.exports = {
  createSubject,
  updateSubject,
  getActiveSubjects,
  disableSubject,
  getSubjectByCode,
  importSubjectsFromExcel,
  loadSubjectLookup,
};
