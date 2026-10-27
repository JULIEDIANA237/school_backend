const crypto = require("crypto");
const mongoose = require("mongoose");
const TeacherAttendanceRecord = require("./teacherAttendance.model");
const SchoolProfile = require("../school/school.model");
const User = require("../users/user.model");
const SchoolYear = require("../schoolYear/schoolYear.model");

/**
 * Formule de Haversine : distance en mètres entre deux coordonnées géographiques
 */
function haversineMeters(lat1, lng1, lat2, lng2) {
  if (!lat1 || !lng1 || !lat2 || !lng2) return 0;
  const R = 6371000; // Rayon de la Terre en mètres
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function generateHexToken() {
  return crypto.randomBytes(16).toString("hex");
}

/** Code à 6 chiffres de la borne, pour la saisie manuelle quand la caméra est indisponible */
function generateShortCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

const QR_TTL_SECONDS = 30;

/** Cache mémoire pour les badges dynamiques des enseignants (Mode B) */
const teacherBadgeCache = new Map();

/**
 * Récupère le profil de l'établissement avec ses coordonnées GPS
 */
async function getSchoolConfig() {
  let profile = await SchoolProfile.findOne({ key: "default" });
  if (!profile) {
    profile = await SchoolProfile.create({ key: "default", name: "Établissement Scolaire" });
  }
  return profile;
}

/**
 * Obtient ou fait tourner le QR Code de la Borne fixe de l'école (Mode A)
 */
async function getKioskQr() {
  const school = await getSchoolConfig();
  const now = Date.now();
  const lastRotated = school.kioskQrRotatedAt ? new Date(school.kioskQrRotatedAt).getTime() : 0;
  const isExpired = !school.kioskQrToken || now - lastRotated >= QR_TTL_SECONDS * 1000;

  if (isExpired || !school.kioskShortCode) {
    school.kioskQrToken = generateHexToken();
    school.kioskShortCode = generateShortCode();
    school.kioskQrRotatedAt = new Date();
    await school.save();
  }

  const ageSeconds = Math.floor((Date.now() - new Date(school.kioskQrRotatedAt).getTime()) / 1000);
  const remainingSeconds = Math.max(0, QR_TTL_SECONDS - ageSeconds);

  return {
    kioskQrToken: school.kioskQrToken,
    kioskShortCode: school.kioskShortCode,
    qrRotatedAt: school.kioskQrRotatedAt,
    ttlSeconds: QR_TTL_SECONDS,
    remainingSeconds,
    schoolName: school.name,
    latitude: school.latitude,
    longitude: school.longitude,
    radiusMeters: school.radiusMeters || 200,
  };
}

/**
 * Force la rotation immédiate du QR code de la borne
 */
async function rotateKioskQr() {
  const school = await getSchoolConfig();
  school.kioskQrToken = generateHexToken();
  school.kioskShortCode = generateShortCode();
  school.kioskQrRotatedAt = new Date();
  await school.save();
  return {
    kioskQrToken: school.kioskQrToken,
    kioskShortCode: school.kioskShortCode,
    qrRotatedAt: school.kioskQrRotatedAt,
    ttlSeconds: QR_TTL_SECONDS,
  };
}

/**
 * Génère le Badge QR dynamique de l'enseignant (Mode B)
 */
async function generateTeacherBadge(teacherId, lat, lng) {
  const token = generateHexToken();
  const now = new Date();

  teacherBadgeCache.set(token, {
    teacherId: String(teacherId),
    lat: Number(lat) || null,
    lng: Number(lng) || null,
    generatedAt: now,
  });

  // Nettoyage des tokens expirés
  setTimeout(() => teacherBadgeCache.delete(token), (QR_TTL_SECONDS + 15) * 1000);

  return {
    badgeQrToken: token,
    qrRotatedAt: now,
    ttlSeconds: QR_TTL_SECONDS,
  };
}

/**
 * Enregistrement du pointage officiel (Arrivée ou Départ uniquement)
 */
async function recordTeacherAttendance(callerUser, payload) {
  const { type, qrToken, lat, lng, mode = "KIOSK_SCAN" } = payload;

  if (!["ARRIVAL", "DEPARTURE"].includes(type)) {
    throw { status: 400, message: "Le type de pointage doit être ARRIVAL ou DEPARTURE." };
  }
  if (!qrToken) {
    throw { status: 400, message: "Le jeton QR dynamique est requis." };
  }
  if (lat === undefined || lng === undefined) {
    throw { status: 400, message: "Les coordonnées GPS sont requises pour pointer." };
  }

  const school = await getSchoolConfig();
  let targetTeacherId;
  let status = "VALID";

  /* ───── Mode A : L'enseignant a scanné la borne de l'école ───── */
  if (mode === "KIOSK_SCAN") {
    if (callerUser.role !== "teacher" && callerUser.role !== "admin") {
      throw { status: 403, message: "Ce pointage est réservé aux enseignants." };
    }
    targetTeacherId = callerUser.id;

    // Vérification du jeton de la borne
    const now = Date.now();
    const tokenAge = school.kioskQrRotatedAt ? (now - new Date(school.kioskQrRotatedAt).getTime()) / 1000 : 999;
    // Jeton du QR, ou code à 6 chiffres saisi à la main (espaces ignorés)
    const typedCode = String(qrToken).replace(/\s+/g, "");
    const matchesQr = school.kioskQrToken === qrToken;
    const matchesShortCode = /^\d{6}$/.test(typedCode) && school.kioskShortCode === typedCode;
    if (!(matchesQr || matchesShortCode) || tokenAge > QR_TTL_SECONDS + 10) {
      throw { status: 400, message: "Le QR Code de la borne a expiré. Veuillez rescanner." };
    }
  } else {
    /* ───── Mode B : Le surveillant/vigile a scanné le badge du prof ───── */
    const badgeData = teacherBadgeCache.get(qrToken);
    if (!badgeData) {
      throw { status: 400, message: "Ce badge QR est expiré ou invalide." };
    }
    targetTeacherId = badgeData.teacherId;
    teacherBadgeCache.delete(qrToken); // Jeton à usage unique
  }

  // Résolution de l'année scolaire courante
  const currentYear = await SchoolYear.findOne({ isCurrent: true }) || await SchoolYear.findOne().sort({ name: -1 });
  if (!currentYear) throw { status: 500, message: "Aucune année scolaire active configurée." };

  const todayStr = new Date().toISOString().slice(0, 10);
  const nowTime = new Date().toLocaleTimeString("fr-FR", { hour12: false });

  // 1. Règle d'unicité : un seul pointage de ce type aujourd'hui
  const existingRecord = await TeacherAttendanceRecord.findOne({
    teacherId: targetTeacherId,
    date: todayStr,
    type,
  });
  if (existingRecord) {
    const label = type === "ARRIVAL" ? "d'arrivée" : "de départ";
    throw { status: 409, message: `Vous avez déjà enregistré votre pointage ${label} aujourd'hui (${existingRecord.time}).` };
  }

  // 2. Règle chronologique : Départ exige une arrivée préalable aujourd'hui
  if (type === "DEPARTURE") {
    const arrival = await TeacherAttendanceRecord.findOne({
      teacherId: targetTeacherId,
      date: todayStr,
      type: "ARRIVAL",
    });
    if (!arrival) {
      throw { status: 400, message: "Impossible d'enregistrer le départ : vous n'avez pas pointé d'arrivée aujourd'hui." };
    }
  }

  // 3. Calcul de la distance GPS par rapport à l'école
  let distance = 0;
  if (school.latitude && school.longitude) {
    distance = Math.round(haversineMeters(school.latitude, school.longitude, Number(lat), Number(lng)));
    const maxRadius = school.radiusMeters || 200;
    if (distance > maxRadius) {
      status = "OUT_OF_RANGE";
    }
  }

  const record = await TeacherAttendanceRecord.create({
    teacherId: targetTeacherId,
    schoolYearId: currentYear._id,
    date: todayStr,
    time: nowTime,
    type,
    mode,
    scannedBy: callerUser.id,
    teacherLat: Number(lat),
    teacherLng: Number(lng),
    schoolLat: school.latitude || null,
    schoolLng: school.longitude || null,
    distanceMeters: distance,
    status,
    qrToken,
    pointedAt: new Date(),
  });

  const teacher = await User.findById(targetTeacherId).select("firstName lastName email");

  return {
    record,
    status,
    distanceMeters: distance,
    radiusMeters: school.radiusMeters || 200,
    teacher,
    message:
      status === "VALID"
        ? `Pointage ${type === "ARRIVAL" ? "d'arrivée" : "de départ"} validé avec succès (${nowTime}).`
        : `Pointage enregistré mais vous êtes localisé à ${distance} m de l'établissement (rayon autorisé : ${school.radiusMeters || 200} m).`,
  };
}

/**
 * Registre de présence du jour pour l'administration et le censeur
 */
async function getTodayAttendanceRegister(dateQuery) {
  const todayStr = dateQuery || new Date().toISOString().slice(0, 10);
  const teachers = await User.find({ role: "teacher", isActive: { $ne: false } })
    .select("firstName lastName email phone")
    .sort({ lastName: 1 })
    .lean();

  const records = await TeacherAttendanceRecord.find({ date: todayStr }).lean();

  const recordsByTeacher = {};
  for (const r of records) {
    const tid = String(r.teacherId);
    if (!recordsByTeacher[tid]) {
      recordsByTeacher[tid] = { arrival: null, departure: null };
    }
    if (r.type === "ARRIVAL") recordsByTeacher[tid].arrival = r;
    if (r.type === "DEPARTURE") recordsByTeacher[tid].departure = r;
  }

  const register = teachers.map((teacher) => {
    const tid = String(teacher._id);
    const data = recordsByTeacher[tid] || { arrival: null, departure: null };
    let presenceStatus = "ABSENT";
    if (data.arrival && data.departure) presenceStatus = "COMPLETED";
    else if (data.arrival) presenceStatus = "ON_SITE";

    return {
      teacher,
      arrival: data.arrival,
      departure: data.departure,
      presenceStatus,
    };
  });

  const presentCount = register.filter((r) => r.presenceStatus !== "ABSENT").length;
  const completedCount = register.filter((r) => r.presenceStatus === "COMPLETED").length;
  const outOfRangeCount = records.filter((r) => r.status === "OUT_OF_RANGE").length;

  return {
    date: todayStr,
    totalTeachers: teachers.length,
    presentCount,
    completedCount,
    absentCount: teachers.length - presentCount,
    outOfRangeCount,
    register,
  };
}

/**
 * Historique personnel de pointage de l'enseignant
 */
async function getTeacherPersonalHistory(teacherId, limit = 30) {
  const records = await TeacherAttendanceRecord.find({ teacherId })
    .sort({ date: -1, type: 1 })
    .limit(limit * 2)
    .lean();

  const groupedByDate = {};
  for (const r of records) {
    if (!groupedByDate[r.date]) {
      groupedByDate[r.date] = { date: r.date, arrival: null, departure: null };
    }
    if (r.type === "ARRIVAL") groupedByDate[r.date].arrival = r;
    if (r.type === "DEPARTURE") groupedByDate[r.date].departure = r;
  }

  return Object.values(groupedByDate).sort((a, b) => b.date.localeCompare(a.date));
}

module.exports = {
  getSchoolConfig,
  getKioskQr,
  rotateKioskQr,
  generateTeacherBadge,
  recordTeacherAttendance,
  getTodayAttendanceRegister,
  getTeacherPersonalHistory,
};

