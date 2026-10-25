const mongoose = require("mongoose");
const ClassSubject = require("./classSubject.model");
const Class = require("./class.model");
const Subject = require("../subjects/subject.model");
const SchoolYear = require("../schoolYear/schoolYear.model");
const { readFirstSheet, createColumnResolver, assertRequiredColumns } = require("../../utils/excel");
const { compactKey } = require("../../utils/text");
const { httpError } = require("../../utils/httpError");
const { bulkWriteSafe } = require("../../utils/bulk");
const { loadSubjectLookup } = require("../subjects/subject.service");

const parseCoefficient = (value) => {
  const n = Number(typeof value === "string" ? value.replace(",", ".") : value);
  if (!Number.isFinite(n) || n <= 0 || n > 20) throw httpError(400, `Coefficient invalide : ${value}`);
  return n;
};

const parseGroup = (value) => {
  if (value === undefined || value === null || value === "") return 1;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 5) throw httpError(400, `Groupe invalide : ${value} (1 à 5)`);
  return n;
};

/** Année d'import : celle demandée, sinon l'année courante, sinon la plus récente. */
const resolveSchoolYear = async (schoolYearId) => {
  if (schoolYearId && mongoose.isValidObjectId(schoolYearId)) {
    const year = await SchoolYear.findById(schoolYearId);
    if (year) return year;
  }
  return (await SchoolYear.findOne({ isCurrent: true })) || (await SchoolYear.findOne().sort({ name: -1 }));
};

const getClassSubjects = async (classId, schoolYearId) => {
  const query = { classId };
  if (schoolYearId) query.schoolYearId = schoolYearId;
  return ClassSubject.find(query).populate("subjectId");
};

/** L'année du coefficient est toujours celle de la classe (jamais celle envoyée par le client). */
const assignSubjectToClass = async (data = {}) => {
  if (!mongoose.isValidObjectId(data.classId)) throw httpError(400, "Classe invalide.");
  if (!mongoose.isValidObjectId(data.subjectId)) throw httpError(400, "Matière invalide.");
  const classDoc = await Class.findById(data.classId).lean();
  if (!classDoc) throw httpError(404, "Classe introuvable.");
  if (!(await Subject.exists({ _id: data.subjectId }))) throw httpError(404, "Matière introuvable.");

  return ClassSubject.findOneAndUpdate(
    { classId: classDoc._id, subjectId: data.subjectId, schoolYearId: classDoc.schoolYearId },
    {
      classId: classDoc._id,
      subjectId: data.subjectId,
      schoolYearId: classDoc.schoolYearId,
      coefficient: parseCoefficient(data.coefficient),
      group: parseGroup(data.group),
      ...(data.weeklyHours !== undefined && data.weeklyHours !== null && {
        weeklyHours: Math.max(0, Number(data.weeklyHours) || 0),
      }),
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true, runValidators: true }
  );
};

const COEFFICIENT_COLUMNS = {
  className: ["classe", "class", "nom de la classe"],
  subject: ["matiere", "subject", "nom de la matiere", "nom", "code matiere", "code"],
  coefficient: ["coefficient", "coeff", "coef"],
  group: ["groupe", "group"],
};

/**
 * Import des coefficients : uniquement les classes de l'année visée (les noms de classe
 * se répètent d'une année sur l'autre).
 */
const importCoefficientsFromExcel = async (fileBuffer, schoolYearId) => {
  const rows = readFirstSheet(fileBuffer);
  const columns = createColumnResolver(rows, COEFFICIENT_COLUMNS);
  assertRequiredColumns(columns, ["className", "subject", "coefficient"], {
    className: "Classe",
    subject: "Matière",
    coefficient: "Coefficient",
  });

  const year = await resolveSchoolYear(schoolYearId);
  if (!year) throw httpError(400, "Aucune année scolaire n'a été trouvée.");

  const [yearClasses, findSubject] = await Promise.all([
    Class.find({ schoolYearId: year._id }).lean(),
    loadSubjectLookup(),
  ]);
  const result = { totalRows: rows.length, created: 0, errors: [], schoolYear: year.name };
  const pending = new Map(); // classe + matière -> { line, op } : la dernière ligne l'emporte

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const line = `Ligne ${i + 2}`;
    try {
      const className = columns.get(row, "className");
      const subjectName = columns.get(row, "subject");
      const coefficientRaw = columns.get(row, "coefficient");
      if (!className && !subjectName && coefficientRaw === null) continue;
      if (!className || !subjectName || coefficientRaw === null) {
        throw new Error("Champs requis manquants (Classe, Matière, Coefficient)");
      }

      const classe = yearClasses.find((c) => compactKey(c.name) === compactKey(className));
      if (!classe) throw new Error(`Classe « ${className} » non trouvée pour l'année ${year.name}`);

      const subject = findSubject(subjectName);
      if (!subject) throw new Error(`Matière « ${subjectName} » non trouvée`);

      const filter = { classId: classe._id, subjectId: subject._id, schoolYearId: year._id };
      pending.set(`${classe._id}:${subject._id}`, {
        line,
        op: {
          updateOne: {
            filter,
            update: {
              $set: {
                ...filter,
                coefficient: parseCoefficient(coefficientRaw),
                group: parseGroup(columns.get(row, "group")),
              },
            },
            upsert: true,
          },
        },
      });
    } catch (err) {
      result.errors.push(`${line}: ${err.message}`);
    }
  }

  const entries = [...pending.values()];
  const failed = await bulkWriteSafe(ClassSubject, entries.map((e) => e.op));
  failed.forEach((f) => result.errors.push(`${entries[f.index].line}: ${f.message}`));
  result.created = entries.length - failed.length;
  return result;
};

module.exports = {
  getClassSubjects,
  assignSubjectToClass,
  importCoefficientsFromExcel,
  resolveSchoolYear,
};
