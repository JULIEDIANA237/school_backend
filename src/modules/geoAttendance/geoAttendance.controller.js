const service = require("./geoAttendance.service");

// Mode A : Borne Kiosk de l'établissement
async function getKioskQr(req, res, next) {
  try {
    const data = await service.getKioskQr();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function rotateKioskQr(req, res, next) {
  try {
    const data = await service.rotateKioskQr();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

// Mode B : Badge Mobile Enseignant
async function getTeacherBadge(req, res, next) {
  try {
    const { lat, lng } = req.query;
    const data = await service.generateTeacherBadge(req.user.id, lat, lng);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

// Pointage officiel (Arrivée ou Départ)
async function checkInOut(req, res, next) {
  try {
    const result = await service.recordTeacherAttendance(req.user, req.body);
    res.status(201).json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

// Registre du jour (Admin & Censeur)
async function getTodayRegister(req, res, next) {
  try {
    const data = await service.getTodayAttendanceRegister(req.query.date);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

// Historique de l'enseignant connecté
async function getMyHistory(req, res, next) {
  try {
    const limit = parseInt(req.query.limit, 10) || 30;
    const history = await service.getTeacherPersonalHistory(req.user.id, limit);
    res.json({ history });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getKioskQr,
  rotateKioskQr,
  getTeacherBadge,
  checkInOut,
  getTodayRegister,
  getMyHistory,
};
