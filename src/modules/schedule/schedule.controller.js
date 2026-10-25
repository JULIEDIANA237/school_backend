const ScheduleService = require("./schedule.service");
const { sendError } = require("../../utils/httpError");

const handle = (fn, successStatus = 200) => async (req, res) => {
  try {
    const result = await fn(req);
    res.status(successStatus).json(result);
  } catch (error) {
    sendError(res, error);
  }
};

const ScheduleController = {
  // Rooms
  getRooms: handle((req) => ScheduleService.getRooms(req.query)),
  createRoom: handle((req) => ScheduleService.createRoom(req.body), 201),
  updateRoom: handle((req) => ScheduleService.updateRoom(req.params.id, req.body)),
  deleteRoom: handle((req) => ScheduleService.deleteRoom(req.params.id)),

  // TimeSlots
  getTimeSlots: handle(() => ScheduleService.getTimeSlots()),
  createTimeSlot: handle((req) => ScheduleService.createTimeSlot(req.body), 201),
  updateTimeSlot: handle((req) => ScheduleService.updateTimeSlot(req.params.id, req.body)),
  deleteTimeSlot: handle((req) => ScheduleService.deleteTimeSlot(req.params.id)),

  // Schedule Entries
  createEntry: handle((req) =>
    ScheduleService.createScheduleEntry(req.body, { allowExceedQuota: req.body.allowExceedQuota }), 201
  ),
  updateEntry: handle((req) =>
    ScheduleService.updateScheduleEntry(req.params.id, req.body, { allowExceedQuota: req.body.allowExceedQuota })
  ),
  deleteEntry: handle((req) => ScheduleService.deleteScheduleEntry(req.params.id)),

  // Schedule Views
  getByClass: handle((req) => ScheduleService.getScheduleByClass(req.params.classId, req.query.schoolYearId)),
  getByTeacher: handle((req) => ScheduleService.getScheduleByTeacher(req.params.teacherId, req.query.schoolYearId)),
  getByRoom: handle((req) => ScheduleService.getScheduleByRoom(req.params.roomId, req.query.schoolYearId)),
  getQuotaSummary: handle((req) => ScheduleService.getQuotaSummaryByClass(req.params.classId, req.query.schoolYearId)),

  // Lesson Log (Cahier de textes)
  createLessonLog: handle((req) => ScheduleService.createLessonLog(req.body, req.user), 201),
  updateLessonLog: handle((req) => ScheduleService.updateLessonLog(req.params.id, req.body, req.user)),
  deleteLessonLog: handle((req) => ScheduleService.deleteLessonLog(req.params.id, req.user)),
  getLogsByClass: handle((req) => ScheduleService.getLessonLogsByClass(req.params.classId, req.query)),
  getUpcomingHomework: handle((req) =>
    ScheduleService.getUpcomingHomework({
      classId: req.query.classId,
      studentUserId: req.user.role === "student" ? req.user.id : undefined,
      parentUserId: req.user.role === "parent" ? req.user.id : undefined,
    })
  ),
  getTodayTeacherSessions: handle((req) =>
    ScheduleService.getTodayTeacherSessions(req.user.id, req.query.date)
  ),

  // Censeur Progression
  getCenseurProgression: handle((req) => ScheduleService.getCenseurProgression(req.query)),

  // Espace Élève
  getMyProfile: handle((req) => ScheduleService.getStudentByUserId(req.user.id)),
  getMySchedule: handle((req) => ScheduleService.getStudentSchedule(req.user.id)),
  getMyHomework: handle((req) =>
    ScheduleService.getUpcomingHomework({ studentUserId: req.user.id })
  ),
  getMyGrades: handle((req) => ScheduleService.getStudentGrades(req.user.id, req.query.periodId)),
  getMyBulletins: handle((req) => ScheduleService.getStudentBulletins(req.user.id, req.query.periodId)),
};

module.exports = ScheduleController;

