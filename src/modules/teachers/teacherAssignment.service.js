const mongoose = require("mongoose");
const TeacherAssignment = require("./teacherAssignment.model");
const User = require("../users/user.model");
const Class = require("../classes/class.model");
const Subject = require("../subjects/subject.model");
const SchoolYear = require("../schoolYear/schoolYear.model");
const { loadTeacherMatcher } = require("../users/user.service");
const { readFirstSheet, createColumnResolver, assertRequiredColumns } = require("../../utils/excel");
const { compactKey } = require("../../utils/text");
const { bulkWriteSafe } = require("../../utils/bulk");
const { loadSubjectLookup } = require("../subjects/subject.service");
const { isTeacherOfClass } = require("../../utils/access");
const { httpError } = require("../../utils/httpError");

const QUERY_FIELDS = ["teacherId", "classId", "subjectId", "schoolYearId"];

const resolveSchoolYear = async (schoolYearId) => {
  if (schoolYearId && mongoose.isValidObjectId(schoolYearId)) {
    const year = await SchoolYear.findById(schoolYearId);
    if (year) return year;
  }
  return (await SchoolYear.findOne({ isCurrent: true })) || (await SchoolYear.findOne().sort({ name: -1 }));
};

const ASSIGNMENT_COLUMNS = {
  className: ["classe", "classes", "class"],
  subject: ["matiere", "subject", "nom de la matiere", "code matiere", "code", "name", "nom"],
  teacher: ["professeur", "prof", "teacher", "enseignant", "email enseignant", "email professeur"],
};

const TeacherAssignmentService = {
  /**
   * Un seul enseignant par classe / matière : l'année est celle de la classe.
   */
  async assign(data = {}) {
    for (const [key, label] of [["teacherId", "Enseignant"], ["classId", "Classe"], ["subjectId", "Matière"]]) {
      if (!mongoose.isValidObjectId(data[key])) throw httpError(400, `${label} invalide.`);
    }
    const [classDoc, teacher, subject] = await Promise.all([
      Class.findById(data.classId).lean(),
      User.findOne({ _id: data.teacherId, role: "teacher" }).lean(),
      Subject.findById(data.subjectId).lean(),
    ]);
    if (!classDoc) throw httpError(404, "Classe introuvable.");
    if (!teacher) throw httpError(404, "Enseignant introuvable.");
    if (!subject) throw httpError(404, "Matière introuvable.");

    return TeacherAssignment.findOneAndUpdate(
      { classId: classDoc._id, subjectId: subject._id, schoolYearId: classDoc.schoolYearId },
      {
        teacherId: teacher._id,
        classId: classDoc._id,
        subjectId: subject._id,
        schoolYearId: classDoc.schoolYearId,
        isActive: true,
      },
      { upsert: true, returnDocument: "after", runValidators: true }
    );
  },

  async getAssignments(query = {}) {
    const filter = {};
    for (const key of QUERY_FIELDS) {
      if (query[key] === undefined || query[key] === "") continue;
      if (!mongoose.isValidObjectId(query[key])) throw httpError(400, `${key} invalide.`);
      filter[key] = query[key];
    }
    return TeacherAssignment.find(filter)
      .populate("teacherId", "firstName lastName")
      .populate("classId", "name")
      .populate("subjectId", "name");
  },

  async removeAssignment(id) {
    if (!mongoose.isValidObjectId(id)) throw httpError(400, "Identifiant invalide.");
    const removed = await TeacherAssignment.findByIdAndDelete(id);
    if (!removed) throw httpError(404, "Affectation introuvable.");
    return removed;
  },

  async getTeacherClasses(teacherId, schoolYearId) {
    const Student = require("../students/student.model");
    const currentYear = await resolveSchoolYear(schoolYearId);
    if (!currentYear) return [];

    const assignments = await TeacherAssignment.find({
      teacherId,
      schoolYearId: currentYear._id,
      isActive: true,
    })
      .populate("classId")
      .populate("subjectId");

    const counts = await Student.aggregate([
      { $match: { class: { $in: assignments.map((a) => a.classId?._id).filter(Boolean) }, isActive: true } },
      { $group: { _id: "$class", count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c.count]));

    // Forme attendue par l'interface : classId -> class, subjectId -> subject
    return assignments
      .filter((a) => a.classId && a.classId.isActive !== false)
      .map((a) => {
        const obj = a.toObject();
        const studentsCount = countMap.get(String(obj.classId._id)) || 0;
        return {
          ...obj,
          class: { ...obj.classId, students: { length: studentsCount } },
          subject: obj.subjectId,
          studentsCount,
        };
      });
  },

  /** Affectations d'une classe (la classe détermine l'année). */
  async getClassSubjects(classId, teacherId = null) {
    if (!mongoose.isValidObjectId(classId)) throw httpError(400, "Classe invalide.");
    const query = { classId, isActive: true };
    if (teacherId) query.teacherId = teacherId;

    const assignments = await TeacherAssignment.find(query)
      .populate("teacherId", "firstName lastName")
      .populate("subjectId");

    return assignments.map((a) => {
      const obj = a.toObject();
      return { ...obj, subject: obj.subjectId, teacher: obj.teacherId };
    });
  },

  /**
   * Import des attributions depuis Excel. Colonnes : Classe (une ou plusieurs, séparées par , ; |),
   * Matière (nom ou code), Professeur (email ou « Prénom Nom »).
   * Seules les classes de l'année visée sont prises en compte.
   */
  async importAssignmentsFromExcel(fileBuffer, schoolYearId) {
    const rows = readFirstSheet(fileBuffer);
    const columns = createColumnResolver(rows, ASSIGNMENT_COLUMNS);
    assertRequiredColumns(columns, ["className", "subject", "teacher"], {
      className: "Classe",
      subject: "Matière",
      teacher: "Professeur",
    });

    const year = await resolveSchoolYear(schoolYearId);
    if (!year) throw httpError(400, "Aucune année scolaire trouvée dans le système");

    // Ancien index unique { class, subject } d'un modèle abandonné : il bloque les insertions s'il existe encore.
    try {
      await TeacherAssignment.collection.dropIndex("class_1_subject_1");
    } catch {
      /* index absent */
    }

    const [yearClasses, matchTeacher, findSubject] = await Promise.all([
      Class.find({ schoolYearId: year._id }).lean(),
      loadTeacherMatcher(),
      loadSubjectLookup(),
    ]);
    const result = { totalRows: rows.length, created: 0, errors: [], schoolYear: year.name };
    const pending = new Map(); // classe + matière -> { line, op } : la dernière ligne l'emporte

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const line = `Ligne ${i + 2}`;
      try {
        const classInput = columns.get(row, "className");
        const subjectName = columns.get(row, "subject");
        const teacherInput = columns.get(row, "teacher");
        if (!classInput && !subjectName && !teacherInput) continue;
        if (!classInput || !subjectName || !teacherInput) {
          throw new Error("Toutes les colonnes (Classe, Matière, Professeur) sont requises");
        }

        const subjectObj = findSubject(subjectName);
        if (!subjectObj) throw new Error(`Matière « ${subjectName} » non trouvée`);

        const { teacher, ambiguous } = matchTeacher(teacherInput);
        if (!teacher) {
          throw new Error(
            ambiguous
              ? `Plusieurs enseignants s'appellent « ${teacherInput} » : utilisez son email`
              : `Professeur « ${teacherInput} » non trouvé`,
          );
        }

        const classNames = String(classInput).split(/[,;|]+/).map((c) => c.trim()).filter(Boolean);
        for (const className of classNames) {
          const classObj = yearClasses.find((c) => compactKey(c.name) === compactKey(className));
          if (!classObj) {
            result.errors.push(`${line}: Classe « ${className} » non trouvée pour ${year.name}. Ignorée.`);
            continue;
          }
          const filter = { classId: classObj._id, subjectId: subjectObj._id, schoolYearId: year._id };
          pending.set(`${classObj._id}:${subjectObj._id}`, {
            line,
            op: { updateOne: { filter, update: { $set: { ...filter, teacherId: teacher._id, isActive: true } }, upsert: true } },
          });
        }
      } catch (err) {
        result.errors.push(`${line}: ${err.message}`);
      }
    }

    const entries = [...pending.values()];
    const failed = await bulkWriteSafe(TeacherAssignment, entries.map((e) => e.op));
    failed.forEach((f) => result.errors.push(`${entries[f.index].line}: ${f.message}`));
    result.created = entries.length - failed.length;
    return result;
  },

  /**
   * Tableau de bord enseignant en une requête : ses classes de l'année et ses évaluations
   * de la période active, chargées en parallèle.
   */
  async getTeacherDashboard(teacherId, schoolYearId) {
    const { getTeacherEvaluations } = require("../evaluations/evaluation.service");
    const [classes, evaluations] = await Promise.all([
      this.getTeacherClasses(teacherId, schoolYearId),
      getTeacherEvaluations(teacherId),
    ]);
    const classIds = new Set(classes.map((a) => String(a.class?._id)));
    return { classes, evaluations: evaluations.filter((e) => classIds.has(String(e.class?._id ?? e.class))) };
  },

  isTeacherAssigned(teacherId, classId, subjectId) {
    return isTeacherOfClass(teacherId, classId, { subjectId });
  },

  isTeacherAssignedToClass(teacherId, classId) {
    return isTeacherOfClass(teacherId, classId);
  },
};

module.exports = TeacherAssignmentService;
