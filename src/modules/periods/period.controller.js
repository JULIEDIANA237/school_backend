const PeriodService = require("./period.service");
const { remindTeachersNow } = require("./deadlineReminder.service");
const { sendError } = require("../../utils/httpError");

const handle = (fn, successStatus = 200) => async (req, res) => {
  try {
    res.status(successStatus).json(await fn(req));
  } catch (error) {
    sendError(res, error);
  }
};

const PeriodController = {
  create: handle((req) => PeriodService.createPeriod(req.body), 201),
  update: handle((req) => PeriodService.updatePeriod(req.params.periodId, req.body)),
  activate: handle((req) => PeriodService.toggleActivation(req.body?.periodId)),
  setClosure: handle((req) => PeriodService.setClosure(req.params.periodId, req.body?.isClosed === true)),
  remindTeachers: handle((req) => remindTeachersNow(req.params.periodId)),
  getActive: handle(() => PeriodService.getActivePeriod()),
  getActiveYearPeriods: handle(() => PeriodService.getPeriodsByActiveYear()),
  getAll: handle(() => PeriodService.getAllPeriods()),
  list: handle((req) => PeriodService.getPeriodsByYear(req.params.year)),
  remove: handle(async (req) => {
    await PeriodService.deletePeriod(req.params.periodId);
    return { message: "Période supprimée" };
  }),
};

module.exports = PeriodController;
