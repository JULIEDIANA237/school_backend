const express = require("express");
const { protect } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const controller = require("./user.controller");

const router = express.Router();

router.use(protect);

const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

// Routes pour l'utilisateur connecté
router.put("/me", controller.updateMe);
router.put("/me/password", controller.changePassword);

// Routes d'administration et secrétariat (restreint dans le contrôleur)
router.post("/import-teachers", authorize("admin", "secretary"), upload.single("file"), controller.importTeachers);
router.post("/", authorize("admin", "secretary"), controller.create);
router.get("/", authorize("admin", "secretary"), controller.getAll);
router.get("/:id", authorize("admin", "secretary"), controller.getOne);
router.put("/:id", authorize("admin", "secretary"), controller.update);
router.delete("/:id", authorize("admin", "secretary"), controller.remove);

module.exports = router;
