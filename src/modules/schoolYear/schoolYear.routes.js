const express = require("express");
const router = express.Router();
const SchoolYearController = require("./schoolYear.controller");
const { protect } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");

router.use(protect);

router.get("/", SchoolYearController.getAll);
router.get("/current", SchoolYearController.getCurrent);
router.post("/", authorize("admin", "secretary"), SchoolYearController.create);
router.put("/:id", authorize("admin", "secretary"), SchoolYearController.update);
router.patch("/:id/current", authorize("admin", "secretary"), SchoolYearController.setCurrent);

module.exports = router;
