const XLSX = require("xlsx");
const mongoose = require("mongoose");
const SubjectProgram = require("./subjectProgram.model");
const LessonLog = require("../schedule/lessonLog.model");
const Class = require("../classes/class.model");
const Subject = require("../subjects/subject.model");
const Period = require("../periods/period.model");
const TeacherAssignment = require("../teachers/teacherAssignment.model");

/**
 * Calcule le total des séances estimées d'une liste de chapitres
 */
const calculateTotalSessions = (chapters = []) =>
  chapters.reduce((sum, ch) => sum + (Number(ch.estimatedSessions) || 1), 0);

/**
 * Récupère l'enseignant assigné à une classe et matière si non spécifié
 */
async function resolveTeacherId(classId, subjectId, schoolYearId) {
  const assignment = await TeacherAssignment.findOne({
    classId,
    subjectId,
    schoolYearId,
    isActive: true,
  });
  return assignment ? assignment.teacherId : null;
}

/**
 * Création ou mise à jour complète d'un programme d'enseignement
 */
async function createOrUpdateProgram(data, userId) {
  const { classId, subjectId, schoolYearId, title, chapters = [], notes, teacherId } = data;

  if (!classId || !subjectId || !schoolYearId) {
    throw new Error("La classe, la matière et l'année scolaire sont requises.");
  }

  const assignedTeacherId = teacherId || (await resolveTeacherId(classId, subjectId, schoolYearId));
  const totalSessions = calculateTotalSessions(chapters);

  const existing = await SubjectProgram.findOne({ classId, subjectId, schoolYearId });

  if (existing) {
    existing.title = title || existing.title;
    existing.chapters = chapters;
    existing.totalEstimatedSessions = totalSessions;
    existing.notes = notes !== undefined ? notes : existing.notes;
    if (assignedTeacherId) existing.teacherId = assignedTeacherId;
    await existing.save();
    return existing;
  }

  const newProgram = await SubjectProgram.create({
    classId,
    subjectId,
    teacherId: assignedTeacherId,
    schoolYearId,
    createdBy: userId,
    title: title || "Programme Officiel d'Enseignement",
    chapters,
    totalEstimatedSessions: totalSessions,
    notes: notes || "",
  });

  return newProgram;
}

/**
 * Liste des programmes avec filtres
 */
async function getPrograms(filters = {}) {
  const query = {};
  if (filters.schoolYearId) query.schoolYearId = filters.schoolYearId;
  if (filters.classId) query.classId = filters.classId;
  if (filters.subjectId) query.subjectId = filters.subjectId;
  if (filters.teacherId) query.teacherId = filters.teacherId;

  return SubjectProgram.find(query)
    .populate("classId", "name level")
    .populate("subjectId", "name code")
    .populate("teacherId", "firstName lastName email")
    .populate("createdBy", "firstName lastName")
    .populate("chapters.sequenceId", "name year")
    .sort({ createdAt: -1 });
}

/**
 * Détail d'un programme avec calcul de progression réelle basé sur le cahier de textes
 */
async function getProgramWithProgress(programId) {
  const program = await SubjectProgram.findById(programId)
    .populate("classId", "name level")
    .populate("subjectId", "name code")
    .populate("teacherId", "firstName lastName email")
    .populate("chapters.sequenceId", "name year");

  if (!program) throw new Error("Programme introuvable");

  // Récupérer les séances effectuées dans le cahier de textes pour cette classe et matière
  const logs = await LessonLog.find({
    classId: program.classId._id,
    subjectId: program.subjectId._id,
    status: "DONE",
  });

  // Calcul du nombre de séances par chapitre
  const logsByChapter = {};
  let totalSessionsDone = 0;

  for (const log of logs) {
    totalSessionsDone += 1;
    if (log.chapterId) {
      const cId = String(log.chapterId);
      logsByChapter[cId] = (logsByChapter[cId] || 0) + 1;
    }
  }

  const enrichedChapters = program.chapters.map((ch) => {
    const cId = String(ch._id);
    const doneCount = logsByChapter[cId] || 0;
    const estimated = ch.estimatedSessions || 1;
    return {
      ...ch.toObject(),
      sessionsDoneCount: doneCount,
      isCompleted: doneCount >= estimated || ch.isCompleted,
      completionRate: Math.min(100, Math.round((doneCount / estimated) * 100)),
    };
  });

  const totalEstimated = program.totalEstimatedSessions || program.chapters.length * 2 || 1;
  const overallProgressPercent = Math.min(
    100,
    Math.round((totalSessionsDone / totalEstimated) * 100)
  );

  return {
    ...program.toObject(),
    chapters: enrichedChapters,
    totalSessionsDone,
    overallProgressPercent,
  };
}

/**
 * Récupère le programme assigné à un enseignant pour une classe et matière
 */
async function getTeacherProgram(teacherId, classId, subjectId, schoolYearId) {
  const query = { classId, subjectId };
  if (schoolYearId) query.schoolYearId = schoolYearId;

  let program = await SubjectProgram.findOne(query)
    .populate("classId", "name level")
    .populate("subjectId", "name code")
    .populate("chapters.sequenceId", "name");

  if (!program) {
    // Si pas de programme formel encore créé, retourner un modèle vide
    return null;
  }

  return getProgramWithProgress(program._id);
}

/**
 * Importation de masse des programmes depuis un fichier Excel (.xlsx)
 * Structure attendue :
 * Colonnes : Classe | Matiere | Sequence | Ordre | Titre | Objectifs | Seances
 */
async function importProgramsFromExcel(buffer, schoolYearId, userId) {
  if (!buffer) throw new Error("Aucun fichier fourni");

  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  if (!rows || rows.length === 0) {
    throw new Error("La feuille Excel est vide ou non valide.");
  }

  // Caches pour limiter les requêtes en base
  const classes = await Class.find({ schoolYearId });
  const subjects = await Subject.find({});
  const periods = await Period.find({ type: "SEQUENCE" });

  const classMap = new Map();
  classes.forEach((c) => classMap.set(c.name.trim().toLowerCase(), c._id));

  const subjectMap = new Map();
  subjects.forEach((s) => {
    subjectMap.set(s.name.trim().toLowerCase(), s._id);
    if (s.code) subjectMap.set(s.code.trim().toLowerCase(), s._id);
  });

  const periodMap = new Map();
  periods.forEach((p) => {
    periodMap.set(p.name.trim().toLowerCase(), { id: p._id, name: p.name });
  });

  // Regroupement par (classId + subjectId)
  const groupedPrograms = new Map();
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // +2 car index 0 et ligne 1 est l'en-tête

    // Normalisation des noms de colonnes
    const rawClass = String(row["Classe"] || row["classe"] || row["Class"] || "").trim().toLowerCase();
    const rawSubject = String(row["Matiere"] || row["matière"] || row["Matière"] || row["Subject"] || "").trim().toLowerCase();
    const rawSequence = String(row["Sequence"] || row["séquence"] || row["Séquence"] || "").trim().toLowerCase();
    const title = String(row["Titre"] || row["titre"] || row["Chapitre"] || row["Leçon"] || row["Module"] || "").trim();
    const objectives = String(row["Objectifs"] || row["objectifs"] || row["Compétences"] || "").trim();
    const sessions = parseInt(row["Seances"] || row["séances"] || row["Séances"] || row["Heures"] || 2, 10);
    const order = parseInt(row["Ordre"] || row["ordre"] || row["N°"] || 1, 10);

    if (!rawClass || !rawSubject || !title) {
      errors.push(`Ligne ${rowNum} ignorée : Classe, Matière et Titre sont obligatoires.`);
      continue;
    }

    const classId = classMap.get(rawClass);
    if (!classId) {
      errors.push(`Ligne ${rowNum} : Classe "${rawClass}" introuvable dans cette année scolaire.`);
      continue;
    }

    const subjectId = subjectMap.get(rawSubject);
    if (!subjectId) {
      errors.push(`Ligne ${rowNum} : Matière "${rawSubject}" introuvable.`);
      continue;
    }

    let sequenceId = null;
    let sequenceName = "";
    if (rawSequence) {
      const p = periodMap.get(rawSequence);
      if (p) {
        sequenceId = p.id;
        sequenceName = p.name;
      } else {
        sequenceName = row["Sequence"] || row["Séquence"] || "";
      }
    }

    const key = `${classId}_${subjectId}`;
    if (!groupedPrograms.has(key)) {
      groupedPrograms.set(key, {
        classId,
        subjectId,
        chapters: [],
      });
    }

    groupedPrograms.get(key).chapters.push({
      sequenceId,
      sequenceName,
      order: isNaN(order) ? 1 : order,
      title,
      objectives,
      estimatedSessions: isNaN(sessions) || sessions < 1 ? 2 : sessions,
    });
  }

  let createdCount = 0;
  let updatedCount = 0;

  for (const [, item] of groupedPrograms) {
    // Trier les chapitres par ordre
    item.chapters.sort((a, b) => a.order - b.order);

    const teacherId = await resolveTeacherId(item.classId, item.subjectId, schoolYearId);
    const totalSessions = calculateTotalSessions(item.chapters);

    const existing = await SubjectProgram.findOne({
      classId: item.classId,
      subjectId: item.subjectId,
      schoolYearId,
    });

    if (existing) {
      existing.chapters = item.chapters;
      existing.totalEstimatedSessions = totalSessions;
      if (teacherId) existing.teacherId = teacherId;
      await existing.save();
      updatedCount += 1;
    } else {
      await SubjectProgram.create({
        classId: item.classId,
        subjectId: item.subjectId,
        teacherId,
        schoolYearId,
        createdBy: userId,
        chapters: item.chapters,
        totalEstimatedSessions: totalSessions,
      });
      createdCount += 1;
    }
  }

  return {
    success: true,
    createdCount,
    updatedCount,
    totalRows: rows.length,
    errors,
  };
}

/**
 * Supprime un programme
 */
async function deleteProgram(programId) {
  return SubjectProgram.findByIdAndDelete(programId);
}

module.exports = {
  createOrUpdateProgram,
  getPrograms,
  getProgramWithProgress,
  getTeacherProgram,
  importProgramsFromExcel,
  deleteProgram,
};

