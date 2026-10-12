const express = require("express");
const PeriodController = require("./period.controller");
const { protect } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");

const router = express.Router();
const staff = authorize("admin", "secretary");

router.use(protect);

router.get("/", PeriodController.getAll);
router.get("/active", PeriodController.getActive);
router.get("/active-year", PeriodController.getActiveYearPeriods);
router.get("/year/:year", PeriodController.list);

router.post("/", staff, PeriodController.create);
router.patch("/activate", staff, PeriodController.activate);
router.put("/:periodId", staff, PeriodController.update);
router.patch("/:periodId/closure", staff, PeriodController.setClosure);
router.post("/:periodId/remind-teachers", staff, PeriodController.remindTeachers);
router.delete("/:periodId", staff, PeriodController.remove);

module.exports = router;
