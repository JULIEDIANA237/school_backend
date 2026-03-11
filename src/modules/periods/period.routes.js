const express = require("express");
const PeriodController = require("./period.controller");
const { protect } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");

const router = express.Router();

// ➕ Créer une période (admin)
router.post(
  "/",
  protect,
  authorize("admin"),
  PeriodController.create
);

// 🔄 Activer une période (admin)
// Le year est désormais déduit depuis la période en BD
router.patch(
  "/activate",
  protect,
  authorize("admin"),
  PeriodController.activate
);

// 🔥 Récupérer la période active (sans year)
router.get(
  "/active",
  protect,
  PeriodController.getActive
);

router.get(
  "/active-year",
  protect,
  PeriodController.getActiveYearPeriods
);

// 📅 Lister les périodes d’une année donnée
router.get(
  "/year/:year",
  protect,
  PeriodController.list
);

// ❌ Supprimer une période (admin)
router.delete(
  "/:periodId",
  protect,
  authorize("admin"),
  PeriodController.remove
);

module.exports = router;
