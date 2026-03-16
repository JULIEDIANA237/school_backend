const express = require("express");
const { protect } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const controller = require("./user.controller");

const router = express.Router();

router.use(protect);

// Routes pour l'utilisateur connecté
router.put("/me", controller.updateMe);
router.put("/me/password", controller.changePassword);

// Routes d'administration
router.post("/", authorize("admin"), controller.create);
router.get("/", authorize("admin"), controller.getAll);
router.get("/:id", authorize("admin"), controller.getOne);
router.put("/:id", authorize("admin"), controller.update);
router.delete("/:id", authorize("admin"), controller.remove);

module.exports = router;
