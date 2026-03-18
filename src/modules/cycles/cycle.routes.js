const express = require("express");
const { protect } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const controller = require("./cycle.controller");

const router = express.Router();

router.use(protect); 

router.get("/", authorize("admin", "secretary"), controller.getAll);

module.exports = router;
