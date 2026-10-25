const express = require("express");
const { connectDatabase } = require("./utils/db");
const cors = require("cors");
const helmet = require("helmet");
const authRoutes = require("./modules/auth/auth.routes");
const classRoutes = require("./modules/classes/class.routes");
const bulletinRoutes = require("./modules/bulletins/bulletin.routes");
const evaluationRoutes = require("./modules/evaluations/evaluation.routes");
const gradeRoutes = require("./modules/grades/grade.routes");
const periodRoutes = require("./modules/periods/period.routes");
const studentRoutes = require("./modules/students/student.routes");
const teacherRoutes = require("./modules/teachers/teacherAssignment.routes");
const subjectRoutes = require("./modules/subjects/subject.routes");
const notificationRoutes = require("./modules/notifications/notification.routes");
const userRoutes = require("./modules/users/user.routes");
const dashboardRoutes = require("./modules/dashboard/dashboard.routes");
const cycleRoutes = require("./modules/cycles/cycle.routes");
const classSubjectRoutes = require("./modules/classes/classSubject.routes");
const schoolYearRoutes = require("./modules/schoolYear/schoolYear.routes");
const schoolRoutes = require("./modules/school/school.routes");
const vieScolaireRoutes = require("./modules/vieScolaire/vieScolaire.routes");
const scheduleRoutes = require("./modules/schedule/schedule.routes");
const { createLimiter } = require("./utils/rateLimit");
const { notFound, errorHandler } = require("./middlewares/error.middleware");
const { runDeadlineReminders } = require("./modules/periods/deadlineReminder.service");
const crypto = require("crypto");

const app = express();

const DEV_ORIGINS = [
  "http://localhost:8080",
  "http://localhost:4173",
  "http://localhost:4174",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:4173",
  "http://127.0.0.1:4174",
];

const configuredOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map((s) => s.trim().replace(/\/+$/, ""))
  .filter(Boolean);

const allowedOrigins = new Set(
  process.env.NODE_ENV === "production" ? configuredOrigins : [...configuredOrigins, ...DEV_ORIGINS]
);

// Hors production : un téléphone du même réseau Wi-Fi qui ouvre l'application via l'adresse IP du poste
const PRIVATE_NETWORK_ORIGIN =
  /^http:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;
const isAllowedOrigin = (origin) =>
  !origin ||
  allowedOrigins.has(origin) ||
  (process.env.NODE_ENV !== "production" && PRIVATE_NETWORK_ORIGIN.test(origin));

app.set("trust proxy", 1); // Vercel
app.disable("x-powered-by");
app.use(helmet());

app.use(
  cors({
    origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));

app.use(async (req, res, next) => {
  try {
    await connectDatabase();
    next();
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    res.status(503).json({ error: "Database unavailable" });
  }
});

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "School backend API is running",
  });
});

app.use(
  "/api/auth",
  createLimiter({ name: "auth", windowMs: 15 * 60 * 1000, limit: 30 }),
  authRoutes
);

app.use("/api/classes", classRoutes);
app.use("/api/bulletins", bulletinRoutes);
app.use("/api/evaluations", evaluationRoutes);
app.use("/api/grades", gradeRoutes);
app.use("/api/periods", periodRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/teacher", teacherRoutes);
app.use("/api/subjects", subjectRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/users", userRoutes);
app.use("/api/admin/dashboard", dashboardRoutes);
app.use("/api/cycles", cycleRoutes);
app.use("/api/class-subjects", classSubjectRoutes);
app.use("/api/school-years", schoolYearRoutes);
app.use("/api/school", schoolRoutes);
app.use("/api/vie-scolaire", vieScolaireRoutes);
app.use("/api/schedule", scheduleRoutes);

// Tâche planifiée (vercel.json → crons) : rappels de clôture aux enseignants.
// Vercel envoie « Authorization: Bearer <CRON_SECRET> » lorsque la variable CRON_SECRET est définie.
app.get("/api/cron/deadline-reminders", async (req, res, next) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ error: "CRON_SECRET n'est pas configuré." });
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(String(req.headers.authorization || ""));
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    return res.status(401).json({ error: "Non autorisé." });
  }
  try {
    res.json({ reminders: await runDeadlineReminders() });
  } catch (error) {
    next(error);
  }
});

app.use(notFound);
app.use(errorHandler);

module.exports = app;
