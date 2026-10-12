const xlsx = require("xlsx");
const { normalizeText } = require("./text");
const { httpError } = require("./httpError");

const readFirstSheet = (fileBuffer) => {
  let workbook;
  try {
    workbook = xlsx.read(fileBuffer, { type: "buffer", cellDates: true });
  } catch {
    throw httpError(400, "Fichier illisible : envoyez un fichier Excel (.xlsx, .xls) ou CSV.");
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw httpError(400, "Le fichier ne contient aucune feuille.");
  return xlsx.utils.sheet_to_json(sheet, { defval: null, raw: true });
};

/**
 * Associe chaque champ attendu à UNE colonne du fichier, par égalité exacte de
 * l'en-tête normalisé (sans accents, casse ni ponctuation). Une colonne n'est
 * attribuée qu'une fois : « Nom parent » ne peut plus être pris pour « Nom ».
 *
 * @param {object[]} rows lignes renvoyées par sheet_to_json
 * @param {Record<string, string[]>} fields { champ: [alias...] } — ordre = priorité
 * @returns {{ get: (row, field) => any, columns: Record<string,string|undefined>, unknownHeaders: string[] }}
 */
const createColumnResolver = (rows, fields) => {
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const byNormalized = new Map(headers.map((h) => [normalizeText(h), h]));
  const used = new Set();
  const columns = {};

  for (const [field, aliases] of Object.entries(fields)) {
    for (const alias of aliases) {
      const header = byNormalized.get(normalizeText(alias));
      if (header && !used.has(header)) {
        columns[field] = header;
        used.add(header);
        break;
      }
    }
  }

  const get = (row, field) => {
    const header = columns[field];
    if (!header) return null;
    const value = row[header];
    if (value === null || value === undefined) return null;
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed === "" ? null : trimmed;
    }
    return value;
  };

  return {
    get,
    columns,
    unknownHeaders: headers.filter((h) => !used.has(h) && !h.startsWith("__EMPTY")),
  };
};

const assertRequiredColumns = (resolver, required, labels) => {
  const missing = required.filter((f) => !resolver.columns[f]);
  if (missing.length) {
    throw httpError(
      400,
      `Colonnes obligatoires introuvables : ${missing.map((f) => labels[f] || f).join(", ")}.`,
    );
  }
};

/** Lit une date Excel : objet Date, numéro de série, JJ/MM/AAAA ou AAAA-MM-JJ. */
const parseExcelDate = (val) => {
  if (val === null || val === undefined || val === "") return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === "number") {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d;
  }
  const str = String(val).trim();
  let m = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return validDate(+m[3], +m[2], +m[1]);
  m = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  return null;
};

const validDate = (y, m, d) => {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
};

module.exports = { readFirstSheet, createColumnResolver, assertRequiredColumns, parseExcelDate };
