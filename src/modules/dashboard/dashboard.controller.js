const Student = require("../students/student.model");
const User = require("../users/user.model");
const Class = require("../classes/class.model");
const Evaluation = require("../evaluations/evaluation.model");
const Bulletin = require("../bulletins/bulletin.model");
const Notification = require("../notifications/notification.model");
const Period = require("../periods/period.model");

const getAdminStats = async (req, res) => {
  try {
    const { year } = req.query;
    const filter = year ? { year } : {};

    const [
      studentsCount, 
      teachersCount, 
      classesCount,
      pendingEvaluations,
      draftBulletins,
      recentActivities,
      allClasses
    ] = await Promise.all([
      Student.countDocuments({ isActive: true }),
      User.countDocuments({ role: "teacher" }),
      Class.countDocuments({ isActive: true }),
      Evaluation.countDocuments({ isPublished: false }),
      Bulletin.countDocuments({ isPublished: false }),
      Notification.find().sort({ createdAt: -1 }).limit(5),
      Class.find({ isActive: true })
    ]);

    // Calculate unique levels
    const levels = new Set(allClasses.map(c => c.level)).size;

    const pendingActionsList = [];
    if (pendingEvaluations > 0) {
      pendingActionsList.push({ 
        id: 'evals', 
        title: `${pendingEvaluations} évaluation(s) non publiée(s)`, 
        urgency: 'medium',
        link: '/teacher/evaluations'
      });
    }
    if (draftBulletins > 0) {
      pendingActionsList.push({ 
        id: 'bulletins', 
        title: `${draftBulletins} bulletin(s) en attente de validation`, 
        urgency: 'high',
        link: '/admin/bulletins'
      });
    }

    res.json({
      students: {
        total: studentsCount,
        newThisMonth: 0, // Could be calculated if we add createdAt to students
        trend: 0
      },
      teachers: {
        total: teachersCount,
        active: teachersCount
      },
      classes: {
        total: classesCount,
        levels: levels
      },
      successRate: {
        value: 0, // Complex calculation from grades
        trend: 0
      },
      pendingActions: pendingActionsList,
      recentActivities: recentActivities.map(n => ({
        id: n._id,
        action: n.title,
        user: n.message.split(' par ')[1] || 'Système',
        time: n.createdAt,
        type: n.type.toLowerCase() === 'success' ? 'success' : 'info'
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getAvailableYears = async (req, res) => {
  try {
    const years = await Period.distinct("year");
    res.json(years.sort().reverse());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getAdminStats,
  getAvailableYears
};
