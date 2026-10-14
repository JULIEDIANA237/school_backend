const mongoose = require("mongoose");
const Student = require("../students/student.model");
const User = require("../users/user.model");
const Class = require("../classes/class.model");
const Evaluation = require("../evaluations/evaluation.model");
const Bulletin = require("../bulletins/bulletin.model");
const Notification = require("../notifications/notification.model");
const Period = require("../periods/period.model");
const { sendError } = require("../../utils/httpError");

/**
 * Statistiques d'administration. `year` = identifiant de l'année scolaire sélectionnée
 * (toutes les années si absent).
 */
const getAdminStats = async (req, res) => {
  try {
    const { year } = req.query;
    const classFilter = { isActive: true };
    if (year) {
      if (!mongoose.isValidObjectId(year)) return res.status(400).json({ error: "Année scolaire invalide." });
      classFilter.schoolYearId = year;
    }

    const classes = await Class.find(classFilter).select("_id level").lean();
    const classIds = classes.map((c) => c._id);
    const byClass = year ? { class: { $in: classIds } } : {};
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    // Notifications du personnel uniquement : celles des parents contiennent les résultats des élèves.
    const staffIds = await User.distinct("_id", { role: { $in: ["admin", "secretary", "teacher", "supervisor"] } });

    const [studentsCount, newStudents, teachersCount, pendingEvaluations, draftBulletins, bulletins, recentActivities] =
      await Promise.all([
        Student.countDocuments({ isActive: true, ...byClass }),
        Student.countDocuments({ isActive: true, createdAt: { $gte: startOfMonth }, ...byClass }),
        User.countDocuments({ role: "teacher" }),
        Evaluation.countDocuments({ isPublished: false, ...byClass }),
        Bulletin.countDocuments({ isPublished: false, ...byClass }),
        Bulletin.find(byClass).select("generalAverage").lean(),
        Notification.find({ user: { $in: staffIds } }).sort({ createdAt: -1 }).limit(5).lean(),
      ]);

    const classified = bulletins.filter((b) => b.generalAverage !== null && b.generalAverage !== undefined);
    const successRate = classified.length
      ? Math.round((classified.filter((b) => b.generalAverage >= 10).length / classified.length) * 1000) / 10
      : 0;

    const pendingActions = [];
    if (pendingEvaluations > 0) {
      pendingActions.push({
        id: "evals",
        title: `${pendingEvaluations} évaluation(s) non publiée(s) par les enseignants`,
        urgency: "medium",
        link: "/admin/bulletins",
      });
    }
    if (draftBulletins > 0) {
      pendingActions.push({
        id: "bulletins",
        title: `${draftBulletins} bulletin(s) en attente de validation`,
        urgency: "high",
        link: "/admin/bulletins",
      });
    }

    res.json({
      students: { total: studentsCount, newThisMonth: newStudents, trend: 0 },
      teachers: { total: teachersCount, active: teachersCount },
      classes: { total: classes.length, levels: new Set(classes.map((c) => c.level)).size },
      successRate: { value: successRate, trend: 0 },
      pendingActions,
      recentActivities: recentActivities.map((n) => ({
        id: n._id,
        action: n.title,
        user: n.message,
        time: n.createdAt,
        type: n.type === "SUCCESS" ? "success" : "info",
      })),
    });
  } catch (err) {
    sendError(res, err, 500);
  }
};

const getAvailableYears = async (req, res) => {
  try {
    const years = await Period.distinct("year");
    res.json(years.sort().reverse());
  } catch (err) {
    sendError(res, err, 500);
  }
};

module.exports = {
  getAdminStats,
  getAvailableYears,
};
