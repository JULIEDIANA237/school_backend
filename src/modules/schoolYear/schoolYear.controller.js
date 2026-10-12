const SchoolYearService = require("./schoolYear.service");
const { sendError } = require("../../utils/httpError");

const handle = (fn, successStatus = 200) => async (req, res) => {
  try {
    res.status(successStatus).json(await fn(req));
  } catch (err) {
    sendError(res, err);
  }
};

const SchoolYearController = {
  getAll: handle(() => SchoolYearService.getAll()),
  getCurrent: handle(() => SchoolYearService.getCurrent()),
  create: handle((req) => SchoolYearService.create(req.body || {}), 201),
  update: handle((req) => SchoolYearService.update(req.params.id, req.body || {})),
  setCurrent: handle((req) => SchoolYearService.setCurrent(req.params.id)),
};

module.exports = SchoolYearController;
