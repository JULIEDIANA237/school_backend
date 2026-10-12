const express = require("express");
const { protect, protectAllowingPasswordChange } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const { spreadsheetUpload } = require("../../utils/upload");
const controller = require("./user.controller");

const router = express.Router();

// Accessibles même quand un changement de mot de passe est exigé
router.get("/me", protectAllowingPasswordChange, controller.getMe);
router.put("/me/password", protectAllowingPasswordChange, controller.changePassword);

router.use(protect);

router.put("/me", controller.updateMe);

// Administration et secrétariat (restrictions fines dans le contrôleur)
router.post("/import-teachers", authorize("admin"), spreadsheetUpload.single("file"), controller.importTeachers);
router.post("/", authorize("admin", "secretary"), controller.create);
router.get("/", authorize("admin", "secretary"), controller.getAll);
router.get("/:id", authorize("admin", "secretary"), controller.getOne);
router.put("/:id", authorize("admin", "secretary"), controller.update);
router.delete("/:id", authorize("admin", "secretary"), controller.remove);

module.exports = router;
