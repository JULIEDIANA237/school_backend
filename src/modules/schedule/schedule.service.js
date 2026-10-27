const mongoose = require("mongoose");
const Room = require("./room.model");
const TimeSlot = require("./timeSlot.model");
const ScheduleEntry = require("./scheduleEntry.model");
const LessonLog = require("./lessonLog.model");
const Class = require("../classes/class.model");
const Subject = require("../subjects/subject.model");
const User = require("../users/user.model");
const ClassSubject = require("../classes/classSubject.model");
const SchoolYear = require("../schoolYear/schoolYear.model");
const Student = require("../students/student.model");
const Grade = require("../grades/grade.model");
const Bulletin = require("../bulletins/bulletin.model");
const Evaluation = require("../evaluations/evaluation.model");
const AttendanceSession = require("../vieScolaire/attendanceSession.model");
const Notification = require("../notifications/notification.model");
const SubjectProgram = require("../programs/subjectProgram.model");
const TeacherAssignment = require("../teachers/teacherAssignment.model");
const { httpError } = require("../../utils/httpError");
const { isCenseur, isTeacherOfClass, sameId } = require("../../utils/access");

const timeToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== "string") return 0;
  const [h, m] = timeStr.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

const doTimesOverlap = (startA, endA, startB, endB) => {
  const a1 = timeToMinutes(startA);
  const a2 = timeToMinutes(endA);
  const b1 = timeToMinutes(startB);
  const b2 = timeToMinutes(endB);
  return a1 < b2 && a2 > b1;
};

const calculateDurationHours = (start, end) => {
  const m1 = timeToMinutes(start);
  const m2 = timeToMinutes(end);
  const diff = Math.max(0, m2 - m1);
  return Math.round((diff / 60) * 100) / 100;
};

const resolveSchoolYearId = async (schoolYearId) => {
  if (schoolYearId && mongoose.isValidObjectId(schoolYearId)) {
    return schoolYearId;
  }
  const current = (await SchoolYear.findOne({ isCurrent: true })) || (await SchoolYear.findOne().sort({ name: -1 }));
  return current ? current._id : null;
};

// -------------------------------------------------------------
// Salles (Rooms)
// -------------------------------------------------------------
const getRooms = async (filter = {}) => {
  const query = {};
  if (filter.isActive !== undefined) query.isActive = filter.isActive;
  return Room.find(query).sort({ name: 1 }).lean();
};

const createRoom = async (data) => {
  if (!data.name || !String(data.name).trim()) {
    throw httpError(400, "Le nom de la salle est obligatoire.");
  }
  const existing = await Room.findOne({ name: String(data.name).trim() });
  if (existing) {
    throw httpError(409, "Une salle avec ce nom existe déjà.");
  }
  return Room.create({
    name: String(data.name).trim(),
    code: data.code ? String(data.code).trim().toUpperCase() : undefined,
    capacity: data.capacity ? Number(data.capacity) : 60,
    building: data.building ? String(data.building).trim() : undefined,
    type: data.type || "CLASSROOM",
    isActive: data.isActive !== false,
  });
};

const updateRoom = async (id, data) => {
  if (!mongoose.isValidObjectId(id)) throw httpError(400, "Identifiant de salle invalide.");
  const room = await Room.findById(id);
  if (!room) throw httpError(404, "Salle introuvable.");

  if (data.name) room.name = String(data.name).trim();
  if (data.code !== undefined) room.code = data.code ? String(data.code).trim().toUpperCase() : undefined;
  if (data.capacity !== undefined) room.capacity = Number(data.capacity);
  if (data.building !== undefined) room.building = data.building ? String(data.building).trim() : undefined;
  if (data.type) room.type = data.type;
  if (data.isActive !== undefined) room.isActive = Boolean(data.isActive);

  await room.save();
  return room;
};

const deleteRoom = async (id) => {
  if (!mongoose.isValidObjectId(id)) throw httpError(400, "Identifiant de salle invalide.");
  const inUse = await ScheduleEntry.exists({ roomId: id, isActive: true });
  if (inUse) {
    throw httpError(409, "Cette salle ne peut pas être supprimée car elle est utilisée dans un emploi du temps.");
  }
  await Room.findByIdAndDelete(id);
  return { message: "Salle supprimée." };
};

// -------------------------------------------------------------
// Créneaux horaires (TimeSlots)
// -------------------------------------------------------------
const getTimeSlots = async () => {
  let slots = await TimeSlot.find({ isActive: true }).sort({ order: 1, startTime: 1 }).lean();
  if (!slots.length) {
    slots = await seedDefaultTimeSlots();
  }
  return slots;
};

const seedDefaultTimeSlots = async () => {
  const defaults = [
    { name: "M1", startTime: "07:30", endTime: "08:25", order: 1, isBreak: false },
    { name: "M2", startTime: "08:25", endTime: "09:20", order: 2, isBreak: false },
    { name: "M3", startTime: "09:20", endTime: "10:15", order: 3, isBreak: false },
    { name: "Pause", startTime: "10:15", endTime: "10:35", order: 4, isBreak: true },
    { name: "M4", startTime: "10:35", endTime: "11:30", order: 5, isBreak: false },
    { name: "M5", startTime: "11:30", endTime: "12:25", order: 6, isBreak: false },
    { name: "M6", startTime: "12:25", endTime: "13:20", order: 7, isBreak: false },
    { name: "Pause déjeuner", startTime: "13:20", endTime: "13:40", order: 8, isBreak: true },
    { name: "S1", startTime: "13:40", endTime: "14:35", order: 9, isBreak: false },
    { name: "S2", startTime: "14:35", endTime: "15:30", order: 10, isBreak: false },
  ];
  return TimeSlot.insertMany(defaults);
};

const createTimeSlot = async (data) => {
  if (!data.name || !data.startTime || !data.endTime) {
    throw httpError(400, "Nom, heure de début et heure de fin sont obligatoires.");
  }
  return TimeSlot.create({
    name: String(data.name).trim(),
    startTime: String(data.startTime).trim(),
    endTime: String(data.endTime).trim(),
    order: Number(data.order) || 1,
    isBreak: Boolean(data.isBreak),
    dayOfWeek: data.dayOfWeek ? Number(data.dayOfWeek) : null,
  });
};

const updateTimeSlot = async (id, data) => {
  if (!mongoose.isValidObjectId(id)) throw httpError(400, "Identifiant invalide.");
  return TimeSlot.findByIdAndUpdate(id, data, { new: true });
};

const deleteTimeSlot = async (id) => {
  if (!mongoose.isValidObjectId(id)) throw httpError(400, "Identifiant invalide.");
  await TimeSlot.findByIdAndDelete(id);
  return { message: "Créneau supprimé." };
};

// -------------------------------------------------------------
// Conflits & Contrôle du Volume Horaire
// -------------------------------------------------------------
const checkScheduleConflicts = async ({
  classId,
  teacherId,
  roomId,
  schoolYearId,
  dayOfWeek,
  startTime,
  endTime,
  excludeEntryId = null,
}) => {
  const queryBase = {
    schoolYearId,
    dayOfWeek: Number(dayOfWeek),
    isActive: true,
  };
  if (excludeEntryId) {
    queryBase._id = { $ne: excludeEntryId };
  }

  // 1. Conflit enseignant
  if (teacherId) {
    const teacherEntries = await ScheduleEntry.find({
      ...queryBase,
      teacherId,
    })
      .populate("classId", "name")
      .populate("subjectId", "name")
      .populate("teacherId", "firstName lastName")
      .lean();

    for (const entry of teacherEntries) {
      if (doTimesOverlap(entry.startTime, entry.endTime, startTime, endTime)) {
        const teacherName = entry.teacherId
          ? `${entry.teacherId.firstName} ${entry.teacherId.lastName}`
          : "L'enseignant";
        const className = entry.classId?.name || "une autre classe";
        const subjectName = entry.subjectId?.name || "un cours";
        throw httpError(
          409,
          `Conflit enseignant : ${teacherName} est déjà occupé(e) avec la classe ${className} pour ${subjectName} (${entry.startTime} - ${entry.endTime}).`,
          "TEACHER_CONFLICT"
        );
      }
    }
  }

  // 2. Conflit salle
  if (roomId) {
    const roomEntries = await ScheduleEntry.find({
      ...queryBase,
      roomId,
    })
      .populate("classId", "name")
      .populate("roomId", "name")
      .populate("subjectId", "name")
      .lean();

    for (const entry of roomEntries) {
      if (doTimesOverlap(entry.startTime, entry.endTime, startTime, endTime)) {
        const roomName = entry.roomId?.name || "Cette salle";
        const className = entry.classId?.name || "une autre classe";
        const subjectName = entry.subjectId?.name || "un cours";
        throw httpError(
          409,
          `Conflit de salle : La salle ${roomName} est déjà occupée par la classe ${className} pour ${subjectName} (${entry.startTime} - ${entry.endTime}).`,
          "ROOM_CONFLICT"
        );
      }
    }
  }

  // 3. Conflit classe (la classe a déjà un cours sur ce créneau)
  if (classId) {
    const classEntries = await ScheduleEntry.find({
      ...queryBase,
      classId,
    })
      .populate("subjectId", "name")
      .lean();

    for (const entry of classEntries) {
      if (doTimesOverlap(entry.startTime, entry.endTime, startTime, endTime)) {
        const subjectName = entry.subjectId?.name || "un autre cours";
        throw httpError(
          409,
          `Conflit de classe : Cette classe a déjà le cours de ${subjectName} sur ce créneau (${entry.startTime} - ${entry.endTime}).`,
          "CLASS_CONFLICT"
        );
      }
    }
  }
};

const checkWeeklyHoursQuota = async ({
  classId,
  subjectId,
  schoolYearId,
  newDurationHours,
  excludeEntryId = null,
  allowExceedQuota = false,
}) => {
  const query = {
    classId,
    subjectId,
    schoolYearId,
    isActive: true,
  };
  if (excludeEntryId) {
    query._id = { $ne: excludeEntryId };
  }

  const existingEntries = await ScheduleEntry.find(query).lean();
  const currentScheduled = existingEntries.reduce((sum, e) => sum + (e.durationHours || 1), 0);
  const totalWithNew = currentScheduled + newDurationHours;

  // Récupérer le quota de ClassSubject ou de Subject
  const classSubject = await ClassSubject.findOne({ classId, subjectId, schoolYearId }).lean();
  let quota = classSubject?.weeklyHours;

  if (quota === undefined || quota === null || quota === 0) {
    const subject = await Subject.findById(subjectId).lean();
    quota = subject?.defaultWeeklyHours || 0;
  }

  if (quota > 0 && totalWithNew > quota && !allowExceedQuota) {
    const subject = await Subject.findById(subjectId).select("name").lean();
    const subjectName = subject?.name || "cette matière";
    throw httpError(
      400,
      `Dépassement du volume horaire hebdomadaire pour ${subjectName} : quota autorisé de ${quota} h/semaine, la saisie porterait le total planifié à ${totalWithNew} h/semaine.`,
      "WEEKLY_HOURS_EXCEEDED"
    );
  }

  return {
    quota,
    scheduledHours: totalWithNew,
    isExceeded: quota > 0 ? totalWithNew > quota : false,
  };
};

// -------------------------------------------------------------
// Entrées d'emploi du temps (Schedule Entries)
// -------------------------------------------------------------
const createScheduleEntry = async (data, { allowExceedQuota = false } = {}) => {
  let { classId, subjectId, teacherId, roomId, dayOfWeek, startTime, endTime, color, notes } = data;

  const schoolYearId = await resolveSchoolYearId(data.schoolYearId);
  if (!schoolYearId) throw httpError(400, "Année scolaire introuvable.");

  // Résolution automatique de l'enseignant assigné si non fourni
  if (!teacherId && classId && subjectId) {
    const TeacherAssignment = require("../teachers/teacherAssignment.model");
    const assignment = await TeacherAssignment.findOne({
      classId,
      subjectId,
      schoolYearId,
      isActive: true,
    }).lean();
    if (assignment) {
      teacherId = String(assignment.teacherId);
    }
  }

  if (!classId || !subjectId || !teacherId || !dayOfWeek || !startTime || !endTime) {
    throw httpError(400, "Classe, matière, enseignant, jour et horaires sont obligatoires.");
  }

  const durationHours = data.durationHours || calculateDurationHours(startTime, endTime);
  if (durationHours <= 0) throw httpError(400, "L'heure de fin doit être postérieure à l'heure de début.");

  // Contrôle des conflits
  await checkScheduleConflicts({
    classId,
    teacherId,
    roomId: roomId || null,
    schoolYearId,
    dayOfWeek,
    startTime,
    endTime,
  });

  // Contrôle du volume horaire
  await checkWeeklyHoursQuota({
    classId,
    subjectId,
    schoolYearId,
    newDurationHours: durationHours,
    allowExceedQuota,
  });

  const entry = await ScheduleEntry.create({
    classId,
    subjectId,
    teacherId,
    roomId: roomId || null,
    schoolYearId,
    dayOfWeek: Number(dayOfWeek),
    startTime,
    endTime,
    durationHours,
    color: color || "#3b82f6",
    notes: notes ? String(notes).trim() : undefined,
  });

  return ScheduleEntry.findById(entry._id)
    .populate("classId", "name level")
    .populate("subjectId", "name code")
    .populate("teacherId", "firstName lastName")
    .populate("roomId", "name code capacity")
    .lean();
};

const updateScheduleEntry = async (id, data, { allowExceedQuota = false } = {}) => {
  if (!mongoose.isValidObjectId(id)) throw httpError(400, "Identifiant invalide.");
  const entry = await ScheduleEntry.findById(id);
  if (!entry) throw httpError(404, "Entrée d'emploi du temps introuvable.");

  const classId = data.classId || entry.classId;
  const subjectId = data.subjectId || entry.subjectId;
  const teacherId = data.teacherId || entry.teacherId;
  const roomId = data.roomId !== undefined ? data.roomId : entry.roomId;
  const dayOfWeek = data.dayOfWeek !== undefined ? Number(data.dayOfWeek) : entry.dayOfWeek;
  const startTime = data.startTime || entry.startTime;
  const endTime = data.endTime || entry.endTime;
  const schoolYearId = entry.schoolYearId;
  const durationHours = data.durationHours || calculateDurationHours(startTime, endTime);

  if (durationHours <= 0) throw httpError(400, "L'heure de fin doit être postérieure à l'heure de début.");

  // Contrôle des conflits
  await checkScheduleConflicts({
    classId,
    teacherId,
    roomId: roomId || null,
    schoolYearId,
    dayOfWeek,
    startTime,
    endTime,
    excludeEntryId: entry._id,
  });

  // Contrôle du volume horaire si matière ou durée changée
  await checkWeeklyHoursQuota({
    classId,
    subjectId,
    schoolYearId,
    newDurationHours: durationHours,
    excludeEntryId: entry._id,
    allowExceedQuota,
  });

  entry.classId = classId;
  entry.subjectId = subjectId;
  entry.teacherId = teacherId;
  entry.roomId = roomId || null;
  entry.dayOfWeek = dayOfWeek;
  entry.startTime = startTime;
  entry.endTime = endTime;
  entry.durationHours = durationHours;
  if (data.color !== undefined) entry.color = data.color;
  if (data.notes !== undefined) entry.notes = data.notes;
  if (data.isActive !== undefined) entry.isActive = Boolean(data.isActive);

  await entry.save();

  return ScheduleEntry.findById(entry._id)
    .populate("classId", "name level")
    .populate("subjectId", "name code")
    .populate("teacherId", "firstName lastName")
    .populate("roomId", "name code capacity")
    .lean();
};

const deleteScheduleEntry = async (id) => {
  if (!mongoose.isValidObjectId(id)) throw httpError(400, "Identifiant invalide.");
  await ScheduleEntry.findByIdAndDelete(id);
  return { message: "Entrée supprimée." };
};

// -------------------------------------------------------------
// Vues de l'Emploi du Temps (Classe, Enseignant, Salle)
// -------------------------------------------------------------
const getScheduleByClass = async (classId, schoolYearIdQuery = null) => {
  if (!mongoose.isValidObjectId(classId)) throw httpError(400, "Identifiant de classe invalide.");
  const classDoc = await Class.findById(classId).lean();
  if (!classDoc) throw httpError(404, "Classe introuvable.");

  const schoolYearId = await resolveSchoolYearId(schoolYearIdQuery || classDoc.schoolYearId);

  const entries = await ScheduleEntry.find({
    classId,
    schoolYearId,
    isActive: true,
  })
    .populate("subjectId", "name code")
    .populate("teacherId", "firstName lastName phone")
    .populate("roomId", "name code capacity building")
    .sort({ dayOfWeek: 1, startTime: 1 })
    .lean();

  const quotaSummary = await getQuotaSummaryByClass(classId, schoolYearId);

  return {
    class: classDoc,
    schoolYearId,
    entries,
    quotaSummary,
  };
};

const getScheduleByTeacher = async (teacherId, schoolYearIdQuery = null) => {
  if (!mongoose.isValidObjectId(teacherId)) throw httpError(400, "Identifiant d'enseignant invalide.");
  const teacher = await User.findById(teacherId).select("firstName lastName email phone").lean();
  if (!teacher) throw httpError(404, "Enseignant introuvable.");

  const schoolYearId = await resolveSchoolYearId(schoolYearIdQuery);

  // Trouver aussi les affectations actives de cet enseignant
  const assignments = await TeacherAssignment.find({
    teacherId,
    schoolYearId,
    isActive: true,
  }).lean();

  const orConditions = [{ teacherId }];

  if (assignments.length > 0) {
    const pairs = assignments.map((a) => ({ classId: a.classId, subjectId: a.subjectId }));
    orConditions.push({
      $and: [
        { $or: pairs },
        { $or: [{ teacherId: null }, { teacherId: { $exists: false } }] },
      ],
    });
  }

  const entries = await ScheduleEntry.find({
    $or: orConditions,
    schoolYearId,
    isActive: true,
  })
    .populate("classId", "name level")
    .populate("subjectId", "name code")
    .populate("roomId", "name code capacity building")
    .sort({ dayOfWeek: 1, startTime: 1 })
    .lean();

  return {
    teacher,
    schoolYearId,
    entries,
  };
};

const getScheduleByRoom = async (roomId, schoolYearIdQuery = null) => {
  if (!mongoose.isValidObjectId(roomId)) throw httpError(400, "Identifiant de salle invalide.");
  const room = await Room.findById(roomId).lean();
  if (!room) throw httpError(404, "Salle introuvable.");

  const schoolYearId = await resolveSchoolYearId(schoolYearIdQuery);

  const entries = await ScheduleEntry.find({
    roomId,
    schoolYearId,
    isActive: true,
  })
    .populate("classId", "name level")
    .populate("subjectId", "name code")
    .populate("teacherId", "firstName lastName")
    .sort({ dayOfWeek: 1, startTime: 1 })
    .lean();

  return {
    room,
    schoolYearId,
    entries,
  };
};

const getQuotaSummaryByClass = async (classId, schoolYearIdQuery = null) => {
  const schoolYearId = await resolveSchoolYearId(schoolYearIdQuery);
  const classSubjects = await ClassSubject.find({ classId, schoolYearId })
    .populate("subjectId", "name code defaultWeeklyHours")
    .lean();

  const scheduledEntries = await ScheduleEntry.find({ classId, schoolYearId, isActive: true }).lean();

  const scheduledBySubject = {};
  for (const entry of scheduledEntries) {
    const sId = String(entry.subjectId);
    scheduledBySubject[sId] = (scheduledBySubject[sId] || 0) + (entry.durationHours || 1);
  }

  return classSubjects.map((cs) => {
    const subject = cs.subjectId;
    const sId = String(subject?._id || cs.subjectId);
    const quota = cs.weeklyHours || subject?.defaultWeeklyHours || 0;
    const scheduled = scheduledBySubject[sId] || 0;
    const diff = scheduled - quota;

    let status = "OK";
    if (quota > 0) {
      if (scheduled > quota) status = "EXCEEDED";
      else if (scheduled < quota) status = "INCOMPLETE";
    }

    return {
      subjectId: sId,
      subjectName: subject?.name || "Matière",
      subjectCode: subject?.code || "",
      coefficient: cs.coefficient,
      quotaHours: quota,
      scheduledHours: scheduled,
      diffHours: diff,
      status,
    };
  });
};

// -------------------------------------------------------------
// Cahier de textes (LessonLog)
// -------------------------------------------------------------
const notifyParentsAboutHomework = async (classId, subjectId, teacherId, homework, dueDate) => {
  try {
    if (!homework || !String(homework).trim()) return;
    const students = await Student.find({ class: classId }).select("parents").lean();
    const parentIds = new Set();
    students.forEach((s) => {
      (s.parents || []).forEach((p) => parentIds.add(String(p)));
    });
    if (parentIds.size === 0) return;

    const [subject, teacher] = await Promise.all([
      Subject.findById(subjectId).select("name").lean(),
      User.findById(teacherId).select("firstName lastName").lean(),
    ]);

    const subjectName = subject?.name || "Matière";
    const teacherName = teacher ? `${teacher.firstName} ${teacher.lastName}` : "L'enseignant";

    const notifDocs = Array.from(parentIds).map((parentId) => ({
      user: parentId,
      title: `📝 Devoir : ${subjectName}`,
      message: `${teacherName} a donné un devoir en ${subjectName} : "${String(homework).trim()}". À rendre pour le ${dueDate || "prochain cours"}.`,
      type: "INFO",
      link: "/parent/schedule",
    }));

    await Notification.insertMany(notifDocs, { ordered: false });
  } catch (err) {
    console.error("Erreur lors de la notification des devoirs aux parents:", err.message);
  }
};

const createLessonLog = async (data, user) => {
  const { classId, subjectId, date, startTime, endTime, title, content, homework, dueDate, status, missedReason } = data;

  if (!classId || !subjectId || !date || !startTime || !endTime || !title) {
    throw httpError(400, "Classe, matière, date, horaires et titre de la séance sont obligatoires.");
  }

  const teacherId = data.teacherId || user.id;

  // Vérifier les droits si l'utilisateur est un enseignant
  if (user.role === "teacher" && !isCenseur(user)) {
    const isAssigned = await isTeacherOfClass(user.id, classId, { subjectId });
    if (!isAssigned && String(teacherId) !== String(user.id)) {
      throw httpError(403, "Vous ne pouvez saisir le cahier de textes que pour vos propres cours.");
    }
  }

  const schoolYearId = await resolveSchoolYearId(data.schoolYearId);
  const hoursDone = data.hoursDone !== undefined ? Number(data.hoursDone) : calculateDurationHours(startTime, endTime);
  const isSigned = data.signed === true;

  const log = await LessonLog.create({
    scheduleEntryId: data.scheduleEntryId || null,
    classId,
    subjectId,
    teacherId,
    schoolYearId,
    date,
    startTime,
    endTime,
    hoursDone: status === "MISSED" || status === "CANCELLED" ? 0 : hoursDone,
    status: status || "DONE",
    title: String(title).trim(),
    content: content ? String(content).trim() : "",
    homework: homework ? String(homework).trim() : "",
    dueDate: dueDate || null,
    chapterId: data.chapterId || null,
    chapterTitle: data.chapterTitle ? String(data.chapterTitle).trim() : "",
    sequenceId: data.sequenceId || null,
    signed: isSigned,
    signedAt: isSigned ? new Date() : null,
    signedBy: isSigned ? user.id : null,
    missedReason: missedReason ? String(missedReason).trim() : "",
    makeupDate: data.makeupDate || null,
  });

  if (isSigned && homework && homework.trim()) {
    setImmediate(() => {
      notifyParentsAboutHomework(classId, subjectId, teacherId, homework, dueDate);
    });
  }

  return LessonLog.findById(log._id)
    .populate("classId", "name level")
    .populate("subjectId", "name code")
    .populate("teacherId", "firstName lastName")
    .lean();
};

const updateLessonLog = async (id, data, user) => {
  if (!mongoose.isValidObjectId(id)) throw httpError(400, "Identifiant invalide.");
  const log = await LessonLog.findById(id);
  if (!log) throw httpError(404, "Séance de cahier de textes introuvable.");

  // Si déjà signée et verrouillée, seul un admin ou censeur peut modifier
  if (log.signed && user.role === "teacher" && !isCenseur(user)) {
    throw httpError(403, "Cette séance a déjà été signée et soumise. Seul un administrateur ou censeur peut la modifier.");
  }

  if (user.role === "teacher" && !isCenseur(user) && String(log.teacherId) !== String(user.id)) {
    throw httpError(403, "Vous ne pouvez modifier que vos propres séances.");
  }

  if (data.title) log.title = String(data.title).trim();
  if (data.content !== undefined) log.content = String(data.content).trim();
  if (data.homework !== undefined) log.homework = String(data.homework).trim();
  if (data.dueDate !== undefined) log.dueDate = data.dueDate || null;
  if (data.chapterId !== undefined) log.chapterId = data.chapterId || null;
  if (data.chapterTitle !== undefined) log.chapterTitle = String(data.chapterTitle).trim();
  if (data.sequenceId !== undefined) log.sequenceId = data.sequenceId || null;

  const wasSigned = log.signed;
  if (data.signed === true && !wasSigned) {
    log.signed = true;
    log.signedAt = new Date();
    log.signedBy = user.id;
  } else if (data.signed === false && (user.role === "admin" || isCenseur(user))) {
    // Déverrouillage par l'admin
    log.signed = false;
    log.signedAt = null;
    log.signedBy = null;
  }

  if (data.status) {
    log.status = data.status;
    if (log.status === "MISSED" || log.status === "CANCELLED") {
      log.hoursDone = 0;
    }
  }
  if (data.hoursDone !== undefined && log.status !== "MISSED" && log.status !== "CANCELLED") {
    log.hoursDone = Number(data.hoursDone);
  }
  if (data.missedReason !== undefined) log.missedReason = String(data.missedReason).trim();
  if (data.makeupDate !== undefined) log.makeupDate = data.makeupDate || null;
  if (data.startTime) log.startTime = data.startTime;
  if (data.endTime) log.endTime = data.endTime;
  if (data.date) log.date = data.date;

  await log.save();

  if (!wasSigned && log.signed && log.homework && log.homework.trim()) {
    setImmediate(() => {
      notifyParentsAboutHomework(log.classId, log.subjectId, log.teacherId, log.homework, log.dueDate);
    });
  }

  return LessonLog.findById(log._id)
    .populate("classId", "name level")
    .populate("subjectId", "name code")
    .populate("teacherId", "firstName lastName")
    .lean();
};

const deleteLessonLog = async (id, user) => {
  if (!mongoose.isValidObjectId(id)) throw httpError(400, "Identifiant invalide.");
  const log = await LessonLog.findById(id);
  if (!log) throw httpError(404, "Séance introuvable.");

  if (log.signed && user.role === "teacher" && !isCenseur(user)) {
    throw httpError(403, "Impossible de supprimer une séance déjà signée et soumise.");
  }

  if (user.role === "teacher" && !isCenseur(user) && String(log.teacherId) !== String(user.id)) {
    throw httpError(403, "Vous ne pouvez supprimer que vos propres séances.");
  }

  await LessonLog.findByIdAndDelete(id);
  return { message: "Séance supprimée du cahier de textes." };
};

const getLessonLogsByClass = async (classId, filter = {}) => {
  if (!mongoose.isValidObjectId(classId)) throw httpError(400, "Identifiant de classe invalide.");
  const query = { classId };

  if (filter.subjectId) query.subjectId = filter.subjectId;
  if (filter.status) query.status = filter.status;
  if (filter.startDate || filter.endDate) {
    query.date = {};
    if (filter.startDate) query.date.$gte = filter.startDate;
    if (filter.endDate) query.date.$lte = filter.endDate;
  }

  return LessonLog.find(query)
    .populate("subjectId", "name code")
    .populate("teacherId", "firstName lastName")
    .sort({ date: -1, startTime: -1 })
    .lean();
};

const getUpcomingHomework = async ({ classId, studentUserId, parentUserId, upcomingOnly = false }) => {
  const query = {
    homework: { $ne: "", $exists: true },
  };

  let targetClassId = classId;

  // Si élève connecté
  if (studentUserId) {
    const student = await Student.findOne({ userId: studentUserId }).lean();
    if (student) targetClassId = student.class;
  }

  // Si parent connecté
  if (parentUserId && !targetClassId) {
    const children = await Student.find({ parents: parentUserId }).select("class").lean();
    const classIds = children.map((c) => c.class);
    query.classId = { $in: classIds };
  } else if (targetClassId) {
    query.classId = targetClassId;
  }

  const today = new Date().toISOString().split("T")[0];
  if (upcomingOnly) {
    const pastCutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    query.dueDate = { $gte: pastCutoff };
  }

  const logs = await LessonLog.find(query)
    .populate("classId", "name level")
    .populate("subjectId", "name code")
    .populate("teacherId", "firstName lastName")
    .sort({ dueDate: 1, date: 1 })
    .lean();

  return logs.map((log) => {
    const due = log.dueDate ? new Date(log.dueDate) : null;
    const now = new Date(today);
    const diffDays = due ? Math.ceil((due - now) / (1000 * 60 * 60 * 24)) : null;

    return {
      _id: log._id,
      title: log.title,
      homework: log.homework,
      dueDate: log.dueDate,
      sessionDate: log.date,
      diffDays,
      isOverdue: diffDays !== null && diffDays < 0,
      isToday: diffDays === 0,
      className: log.classId?.name,
      subjectName: log.subjectId?.name,
      subjectCode: log.subjectId?.code,
      teacherName: log.teacherId ? `${log.teacherId.firstName} ${log.teacherId.lastName}` : "",
    };
  });
};

const getTodayTeacherSessions = async (teacherId, dayString = null) => {
  const day = dayString || new Date().toISOString().split("T")[0];
  const dateObj = new Date(day);
  let jsDay = dateObj.getDay(); // 0 = Dimanche, 1 = Lundi, ...
  const dayOfWeek = jsDay === 0 ? 7 : jsDay; // 1 to 6 (Lundi to Samedi)

  // Trouver aussi les affectations actives de cet enseignant
  const assignments = await TeacherAssignment.find({
    teacherId,
    isActive: true,
  }).lean();

  const orConditions = [{ teacherId }];

  if (assignments.length > 0) {
    const pairs = assignments.map((a) => ({ classId: a.classId, subjectId: a.subjectId }));
    orConditions.push({
      $and: [
        { $or: pairs },
        { $or: [{ teacherId: null }, { teacherId: { $exists: false } }] },
      ],
    });
  }

  const entries = await ScheduleEntry.find({
    $or: orConditions,
    dayOfWeek,
    isActive: true,
  })
    .populate("classId", "name level")
    .populate("subjectId", "name code")
    .populate("roomId", "name code")
    .sort({ startTime: 1 })
    .lean();

  // Pour chaque entrée, voir si le cahier de textes et l'appel ont été faits
  const result = [];
  for (const entry of entries) {
    const log = await LessonLog.findOne({
      classId: entry.classId?._id,
      subjectId: entry.subjectId?._id,
      teacherId,
      date: day,
      startTime: entry.startTime,
    }).lean();

    // 1. Recherche exacte par créneau horaire
    let attendance = await AttendanceSession.findOne({
      class: entry.classId?._id,
      day,
      startTime: entry.startTime,
    }).lean();

    // 2. Recherche avec tolérance si l'appel a été fait pour cette classe et ce jour par cet enseignant ou pour cette matière
    if (!attendance) {
      attendance = await AttendanceSession.findOne({
        class: entry.classId?._id,
        day,
        $or: [
          { takenBy: teacherId },
          { subject: entry.subjectId?._id },
        ],
      }).lean();
    }

    result.push({
      scheduleEntry: entry,
      lessonLog: log || null,
      attendanceDone: Boolean(attendance),
      attendanceSessionId: attendance?._id || null,
    });
  }

  return result;
};

// -------------------------------------------------------------
// Suivi de la progression par le Censeur
// -------------------------------------------------------------
const getCenseurProgression = async ({ schoolYearId: syIdQuery, classId, periodId }) => {
  const schoolYearId = await resolveSchoolYearId(syIdQuery);

  const classQuery = { isActive: true };
  if (classId && classId !== "all") classQuery._id = classId;
  const classes = await Class.find(classQuery).sort({ name: 1 }).lean();

  const classIds = classes.map((c) => c._id);

  // Charger tous les ClassSubjects
  const classSubjects = await ClassSubject.find({ classId: { $in: classIds }, schoolYearId })
    .populate("classId", "name level")
    .populate("subjectId", "name code defaultWeeklyHours")
    .lean();

  // Charger tous les logs de l'année scolaire pour ces classes
  const logs = await LessonLog.find({ classId: { $in: classIds }, schoolYearId })
    .populate("teacherId", "firstName lastName")
    .lean();

  // Charger tous les programmes d'enseignement pour ces classes
  const programs = await SubjectProgram.find({ classId: { $in: classIds }, schoolYearId }).lean();
  const programMap = {};
  for (const prog of programs) {
    programMap[`${prog.classId}_${prog.subjectId}`] = prog;
  }

  // Agréger par classe et matière
  const logsByClassSubject = {};
  for (const log of logs) {
    const key = `${log.classId}_${log.subjectId}`;
    if (!logsByClassSubject[key]) {
      logsByClassSubject[key] = {
        doneHours: 0,
        doneCount: 0,
        missedCount: 0,
        cancelledCount: 0,
        rescheduledCount: 0,
        teacherId: log.teacherId,
      };
    }
    if (log.status === "DONE" || log.status === "RESCHEDULED") {
      logsByClassSubject[key].doneHours += log.hoursDone || 0;
      logsByClassSubject[key].doneCount += 1;
    } else if (log.status === "MISSED") {
      logsByClassSubject[key].missedCount += 1;
    } else if (log.status === "CANCELLED") {
      logsByClassSubject[key].cancelledCount += 1;
    }
  }

  const WEEKS_PER_YEAR = 30; // 30 semaines scolaires au Cameroun
  const progressionRows = [];
  let totalExpectedHours = 0;
  let totalDoneHours = 0;
  let totalMissedSessions = 0;
  let totalDoneSessions = 0;

  for (const cs of classSubjects) {
    const key = `${cs.classId?._id}_${cs.subjectId?._id}`;
    const stats = logsByClassSubject[key] || {
      doneHours: 0,
      doneCount: 0,
      missedCount: 0,
      cancelledCount: 0,
    };

    const weeklyQuota = cs.weeklyHours || cs.subjectId?.defaultWeeklyHours || 0;
    const expectedHours = weeklyQuota * WEEKS_PER_YEAR;
    const doneHours = Math.round(stats.doneHours * 10) / 10;
    const rate = expectedHours > 0 ? Math.min(100, Math.round((doneHours / expectedHours) * 100)) : 0;

    totalExpectedHours += expectedHours;
    totalDoneHours += doneHours;
    totalMissedSessions += stats.missedCount;
    totalDoneSessions += stats.doneCount;

    let alertLevel = "NORMAL";
    if (stats.missedCount > 2) alertLevel = "ATTENTION";
    if (stats.missedCount > 4) alertLevel = "RETARD";

    progressionRows.push({
      classId: cs.classId?._id,
      className: cs.classId?.name,
      level: cs.classId?.level,
      subjectId: cs.subjectId?._id,
      subjectName: cs.subjectId?.name,
      subjectCode: cs.subjectId?.code,
      weeklyQuota,
      expectedHours,
      doneHours,
      rate,
      doneCount: stats.doneCount,
      missedCount: stats.missedCount,
      alertLevel,
      hasOfficialProgram: !!programMap[key],
      programId: programMap[key]?._id || null,
      totalChapters: programMap[key]?.chapters?.length || 0,
      totalEstimatedSessions: programMap[key]?.totalEstimatedSessions || 0,
    });
  }

  // Récentes séances manquées pour les alertes
  const missedLogs = await LessonLog.find({
    classId: { $in: classIds },
    schoolYearId,
    status: "MISSED",
  })
    .populate("classId", "name")
    .populate("subjectId", "name")
    .populate("teacherId", "firstName lastName")
    .sort({ date: -1 })
    .limit(20)
    .lean();

  const globalRate = totalExpectedHours > 0 ? Math.round((totalDoneHours / totalExpectedHours) * 100) : 0;

  return {
    classesCount: classes.length,
    totalExpectedHours,
    totalDoneHours,
    totalDoneSessions,
    totalMissedSessions,
    globalRate,
    progressionRows,
    missedAlerts: missedLogs,
  };
};

// -------------------------------------------------------------
// Espace Élève (Student Portal)
// -------------------------------------------------------------
const getStudentByUserId = async (userId) => {
  const student = await Student.findOne({ userId })
    .populate("class", "name level schoolYearId")
    .lean();
  if (!student) {
    // Si pas trouvé par userId, tenter par email ou autre
    const user = await User.findById(userId).lean();
    if (user && user.email) {
      const match = await Student.findOne({ matricule: user.email.split("@")[0] })
        .populate("class", "name level schoolYearId")
        .lean();
      if (match) return match;
    }
  }
  return student;
};

const getStudentSchedule = async (studentUserId) => {
  const student = await getStudentByUserId(studentUserId);
  if (!student || !student.class) {
    throw httpError(404, "Dossier élève ou classe introuvable.");
  }
  return getScheduleByClass(student.class._id, student.class.schoolYearId);
};

const getStudentGrades = async (studentUserId, periodId = null) => {
  const student = await getStudentByUserId(studentUserId);
  if (!student) throw httpError(404, "Dossier élève introuvable.");

  const query = { student: student._id };
  if (periodId && periodId !== "all") {
    // Récupérer les évaluations de cette période
    const evals = await Evaluation.find({ period: periodId }).distinct("_id");
    query.evaluation = { $in: evals };
  }

  const grades = await Grade.find(query)
    .populate({
      path: "evaluation",
      populate: [
        { path: "subject", select: "name code" },
        { path: "period", select: "name type" },
      ],
    })
    .sort({ createdAt: -1 })
    .lean();

  return {
    student,
    grades: grades.filter((g) => g.evaluation),
  };
};

const getStudentBulletins = async (studentUserId, periodId = null) => {
  const student = await getStudentByUserId(studentUserId);
  if (!student) throw httpError(404, "Dossier élève introuvable.");

  const query = { student: student._id, isPublished: true };
  if (periodId && periodId !== "all") query.period = periodId;

  return Bulletin.find(query)
    .populate("class", "name level")
    .populate("period", "name type year startDate endDate isClosed")
    .populate("averages.subject", "name code")
    .sort({ createdAt: -1 })
    .lean();
};

module.exports = {
  // Rooms
  getRooms,
  createRoom,
  updateRoom,
  deleteRoom,
  // TimeSlots
  getTimeSlots,
  createTimeSlot,
  updateTimeSlot,
  deleteTimeSlot,
  // Schedule
  createScheduleEntry,
  updateScheduleEntry,
  deleteScheduleEntry,
  getScheduleByClass,
  getScheduleByTeacher,
  getScheduleByRoom,
  getQuotaSummaryByClass,
  checkScheduleConflicts,
  checkWeeklyHoursQuota,
  // LessonLog
  createLessonLog,
  updateLessonLog,
  deleteLessonLog,
  getLessonLogsByClass,
  getUpcomingHomework,
  getTodayTeacherSessions,
  // Censeur
  getCenseurProgression,
  // Student
  getStudentByUserId,
  getStudentSchedule,
  getStudentGrades,
  getStudentBulletins,
};
