const express = require("express");
const { protect } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const { sendError } = require("../../utils/httpError");
const SchoolService = require("./school.service");

const router = express.Router();

// Identité publique (en-tête des bulletins, page de vérification d'un QR code, page de connexion)
router.get("/", async (req, res) => {
  try {
    res.json(await SchoolService.getSchoolProfile());
  } catch (error) {
    sendError(res, error);
  }
});

router.put("/", protect, authorize("admin"), async (req, res) => {
  try {
    res.json(await SchoolService.updateSchoolProfile(req.body));
  } catch (error) {
    sendError(res, error);
  }
});

module.exports = router;
