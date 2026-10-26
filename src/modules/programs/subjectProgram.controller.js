const service = require("./subjectProgram.service");

async function createOrUpdate(req, res, next) {
  try {
    const program = await service.createOrUpdateProgram(req.body, req.user.id);
    res.status(201).json({ program });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function list(req, res, next) {
  try {
    const programs = await service.getPrograms(req.query);
    res.json({ programs });
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const program = await service.getProgramWithProgress(req.params.id);
    res.json({ program });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
}

async function getForTeacher(req, res, next) {
  try {
    const { classId, subjectId } = req.params;
    const { schoolYearId } = req.query;
    const program = await service.getTeacherProgram(req.user.id, classId, subjectId, schoolYearId);
    res.json({ program });
  } catch (err) {
    next(err);
  }
}

async function importExcel(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Aucun fichier Excel fourni." });
    }
    const { schoolYearId } = req.body;
    if (!schoolYearId) {
      return res.status(400).json({ error: "L'identifiant de l'année scolaire est requis." });
    }
    const result = await service.importProgramsFromExcel(req.file.buffer, schoolYearId, req.user.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function remove(req, res, next) {
  try {
    await service.deleteProgram(req.params.id);
    res.json({ success: true, message: "Programme supprimé." });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createOrUpdate,
  list,
  getById,
  getForTeacher,
  importExcel,
  remove,
};

