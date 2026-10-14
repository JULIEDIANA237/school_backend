const mongoose = require("mongoose");
const Class = require("./class.model");
const ClassSubject = require("./classSubject.model");
const Student = require("../students/student.model");
const User = require("../users/user.model");
const SchoolYear = require("../schoolYear/schoolYear.model");
const Cycle = require("../cycles/cycle.model");
const TeacherAssignment = require("../teachers/teacherAssignment.model");
const CycleService = require("../cycles/cycle.service");
const SchoolYearService = require("../schoolYear/schoolYear.service");
const { loadTeacherMatcher } = require("../users/user.service");
const { readFirstSheet, createColumnResolver, assertRequiredColumns } = require("../../utils/excel");
const { normalizeText } = require("../../utils/text");
const { httpError } = require("../../utils/httpError");
const { bulkWriteSafe } = require("../../utils/bulk");

const CLASS_FIELDS = ["name", "level", "cycleId", "serie", "principalTeacher", "supervisor", "isActive"];
const pickFields = (data = {}) =>
  Object.fromEntries(CLASS_FIELDS.filter((k) => data[k] !== undefined).map((k) => [k, data[k]]));

const assertObjectId = (value, label) => {
  if (!mongoose.isValidObjectId(value)) throw httpError(400, `${label} invalide.`);
};

const normalizePrincipal = async (fields) => {
  if (fields.principalTeacher === undefined) return;
  if (fields.principalTeacher === null || fields.principalTeacher === "") {
    fields.principalTeacher = null;
    return;
  }
  assertObjectId(fields.principalTeacher, "Professeur principal");
  if (!(await User.exists({ _id: fields.principalTeacher, role: "teacher" }))) {
    throw httpError(400, "Le professeur principal doit être un enseignant existant.");
  }
};

/** Surveillant général : un enseignant ou une secrétaire à qui la fonction « vie scolaire » est confiée. */
const normalizeSupervisor = async (fields) => {
  if (fields.supervisor === undefined) return;
  if (fields.supervisor === null || fields.supervisor === "") {
    fields.supervisor = null;
    return;
  }
  assertObjectId(fields.supervisor, "Surveillant général");
  if (!(await User.exists({ _id: fields.supervisor, ...User.SUPERVISOR_QUERY }))) {
    throw httpError(400, "Choisissez un surveillant général (compte dédié ou enseignant qui cumule la fonction).");
  }
};

const createClass = async (data) => {
  if (!data.schoolYearId) throw httpError(400, "schoolYearId est requis");
  assertObjectId(data.schoolYearId, "Année scolaire");
  if (!(await SchoolYear.exists({ _id: data.schoolYearId }))) throw httpError(400, "Année scolaire introuvable.");
  const fields = pickFields(data);
  if (fields.cycleId) {
    assertObjectId(fields.cycleId, "Cycle");
    if (!(await Cycle.exists({ _id: fields.cycleId }))) throw httpError(400, "Cycle introuvable.");
  }
  await normalizePrincipal(fields);
  await normalizeSupervisor(fields);
  for (const key of ["principalTeacher", "supervisor"]) if (fields[key] === null) delete fields[key];
  return Class.create({ ...fields, schoolYearId: data.schoolYearId });
};

/** L'année scolaire d'une classe ne change pas : on crée une nouvelle classe chaque année. */
const updateClass = async (id, data) => {
  assertObjectId(id, "Identifiant de classe");
  const fields = pickFields(data);
  await normalizePrincipal(fields);
  await normalizeSupervisor(fields);
  const update = { $set: { ...fields } };
  // null : retirer le professeur principal ou le surveillant général
  for (const key of ["principalTeacher", "supervisor"]) {
    if (fields[key] !== null) continue;
    delete update.$set[key];
    update.$unset = { ...update.$unset, [key]: 1 };
  }
  const updated = await Class.findByIdAndUpdate(id, update, { returnDocument: "after", runValidators: true });
  if (!updated) throw httpError(404, "Classe introuvable.");
  return updated;
};

/**
 * Une classe qui a un historique (élèves, évaluations, bulletins) est désactivée et non supprimée,
 * pour ne pas laisser de notes ni de bulletins orphelins.
 */
const deleteClass = async (id) => {
  assertObjectId(id, "Identifiant de classe");
  const Evaluation = require("../evaluations/evaluation.model");
  const Bulletin = require("../bulletins/bulletin.model");
  const classDoc = await Class.findById(id);
  if (!classDoc) throw httpError(404, "Classe introuvable.");

  const hasHistory =
    (await Student.exists({ class: id })) ||
    (await Evaluation.exists({ class: id })) ||
    (await Bulletin.exists({ class: id }));
  if (hasHistory) {
    classDoc.isActive = false;
    await classDoc.save();
    return { mode: "deactivated" };
  }

  await Promise.all([ClassSubject.deleteMany({ classId: id }), TeacherAssignment.deleteMany({ classId: id })]);
  await classDoc.deleteOne();
  return { mode: "deleted" };
};

const CLASS_COLUMNS = {
  name: ["nom", "name", "classe", "class", "nom de la classe"],
  level: ["niveau", "level"],
  cycle: ["cycle"],
  year: ["annee", "annee scolaire", "year", "school year"],
  serie: ["serie", "series"],
  principalTeacher: [
    "professeur principal",
    "prof principal",
    "principal teacher",
    "principalteacher",
    "enseignant principal",
    "titulaire",
  ],
};

const cycleLabelFrom = (input) => {
  const text = normalizeText(input);
  if (/premier|1er|\b1\b/.test(text)) return "Premier cycle";
  if (/second|2nd|deuxieme|\b2\b/.test(text)) return "Second cycle";
  return null;
};

/**
 * Import des classes depuis Excel : Nom, Niveau, Cycle, Année (ou année sélectionnée), Série,
 * Professeur principal (email ou « Prénom Nom »).
 */
const importClassesFromExcel = async (fileBuffer, defaultSchoolYearId) => {
  const rows = readFirstSheet(fileBuffer);
  const columns = createColumnResolver(rows, CLASS_COLUMNS);
  assertRequiredColumns(columns, ["name", "level", "cycle"], { name: "Nom", level: "Niveau", cycle: "Cycle" });

  let defaultYear = null;
  if (defaultSchoolYearId && mongoose.isValidObjectId(defaultSchoolYearId)) {
    defaultYear = await SchoolYear.findById(defaultSchoolYearId);
  }
  if (!columns.columns.year && !defaultYear) {
    throw httpError(400, "Indiquez une colonne « Année » ou sélectionnez une année scolaire avant l'import.");
  }

  const matchTeacher = await loadTeacherMatcher();
  const result = { totalRows: rows.length, created: 0, errors: [] };
  // Années et cycles ne changent presque jamais d'une ligne à l'autre : une requête par valeur distincte
  const yearCache = new Map();
  const cycleCache = new Map();
  const cached = (cache, key, load) => {
    if (!cache.has(key)) cache.set(key, load());
    return cache.get(key);
  };
  const pending = new Map(); // nom + année -> { line, op } : la dernière ligne l'emporte

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const line = `Ligne ${i + 2}`;
    try {
      const name = columns.get(row, "name");
      const level = columns.get(row, "level");
      const cycle = columns.get(row, "cycle");
      const year = columns.get(row, "year");

      if (!name && !level && !cycle && !year) continue;
      if (!name || !level || !cycle) throw new Error("Champs requis manquants (Nom, Niveau, Cycle)");

      const schoolYear = year ? await cached(yearCache, String(year), () => SchoolYearService.findOrCreate(String(year))) : defaultYear;
      const cycleLabel = cycleLabelFrom(cycle);
      if (!cycleLabel) throw new Error(`Cycle inconnu « ${cycle} » (attendu : Premier cycle ou Second cycle)`);
      const cycleObj = await cached(cycleCache, cycleLabel, () => CycleService.findOrCreateCycle(cycleLabel));

      const update = {
        name: String(name).trim(),
        level: String(level).trim(),
        cycleId: cycleObj._id,
        schoolYearId: schoolYear._id,
        serie: columns.get(row, "serie") ? String(columns.get(row, "serie")) : "",
        isActive: true,
      };

      const teacherInput = columns.get(row, "principalTeacher");
      if (teacherInput) {
        const { teacher, ambiguous } = matchTeacher(teacherInput);
        if (teacher) update.principalTeacher = teacher._id;
        else
          result.errors.push(
            `${line}: Enseignant « ${teacherInput} » ${
              ambiguous ? "ambigu (plusieurs homonymes) : utilisez son email" : "non trouvé : importez-le d'abord ou utilisez son email"
            }.`,
          );
      }

      const filter = { name: update.name, schoolYearId: schoolYear._id };
      pending.set(`${update.name}:${schoolYear._id}`, { line, op: { updateOne: { filter, update: { $set: update }, upsert: true } } });
    } catch (err) {
      result.errors.push(`${line}: ${err.message}`);
    }
  }

  const entries = [...pending.values()];
  const failed = await bulkWriteSafe(Class, entries.map((e) => e.op));
  failed.forEach((f) => result.errors.push(`${entries[f.index].line}: ${f.message}`));
  result.created = entries.length - failed.length;
  return result;
};

/** Classes accessibles à un enseignant : affectations actives et classes dont il est professeur principal. */
const teacherClassIds = async (teacherId) => {
  const [assigned, principal] = await Promise.all([
    TeacherAssignment.distinct("classId", { teacherId, isActive: true }),
    Class.distinct("_id", { principalTeacher: teacherId }),
  ]);
  return [...assigned, ...principal];
};

const getAllClasses = async (schoolYearId, user) => {
  const query = { isActive: true };
  if (schoolYearId) {
    assertObjectId(schoolYearId, "Année scolaire");
    query.schoolYearId = schoolYearId;
  }
  if (user?.role === "teacher") query._id = { $in: await teacherClassIds(user.id) };

  const classes = await Class.find(query)
    .populate("cycleId")
    .populate("schoolYearId")
    .populate("principalTeacher", "firstName lastName")
    .populate("supervisor", "firstName lastName")
    .sort({ name: 1 })
    .lean();

  const counts = await Student.aggregate([
    { $match: { class: { $in: classes.map((c) => c._id) }, isActive: true } },
    { $group: { _id: "$class", count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.count]));

  return classes.map((c) => {
    const studentsCount = countMap.get(String(c._id)) || 0;
    // `students` garde la forme attendue par l'interface (seule sa longueur est utilisée)
    return { ...c, studentsCount, students: new Array(studentsCount).fill({}) };
  });
};

const getClassDetails = async (id) => {
  const classDoc = await Class.findById(id)
    .populate("cycleId")
    .populate("schoolYearId")
    .populate("principalTeacher", "firstName lastName")
    .populate("supervisor", "firstName lastName");
  if (!classDoc) throw httpError(404, "Classe introuvable.");
  return classDoc;
};

/** L'appartenance d'un élève à une classe est portée par Student.class. */
const addStudentToClass = async (classId, studentId) => {
  assertObjectId(classId, "Identifiant de classe");
  assertObjectId(studentId, "Identifiant d'élève");
  const classDoc = await Class.findOne({ _id: classId, isActive: true });
  if (!classDoc) throw httpError(404, "Classe introuvable ou inactive.");
  const student = await Student.findByIdAndUpdate(studentId, { class: classId }, { returnDocument: "after" });
  if (!student) throw httpError(404, "Élève introuvable.");
  return classDoc;
};

const addTeacherToClass = async (classId, teacherId) => updateClass(classId, { principalTeacher: teacherId });

const getClassStudents = async (id) =>
  Student.find({ class: id, isActive: true })
    .populate("parents", "firstName lastName phone")
    .sort({ lastName: 1, firstName: 1 });

const getClassSubjects = async (id) => ClassSubject.find({ classId: id }).populate("subjectId");

/** Enseignants de la classe avec les matières qu'ils y enseignent. */
const getClassTeachers = async (id) => {
  const assignments = await TeacherAssignment.find({ classId: id, isActive: true })
    .populate("teacherId", "firstName lastName email phone")
    .populate("subjectId", "name code")
    .lean();
  const byTeacher = new Map();
  for (const a of assignments) {
    if (!a.teacherId) continue;
    const key = String(a.teacherId._id);
    if (!byTeacher.has(key)) byTeacher.set(key, { ...a.teacherId, subjects: [] });
    if (a.subjectId) byTeacher.get(key).subjects.push(a.subjectId);
  }
  return [...byTeacher.values()];
};

module.exports = {
  createClass,
  updateClass,
  deleteClass,
  importClassesFromExcel,
  getAllClasses,
  getClassDetails,
  addStudentToClass,
  addTeacherToClass,
  getClassStudents,
  getClassSubjects,
  getClassTeachers,
};
