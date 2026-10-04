const express = require("express");
const mongoose = require('mongoose');
const cors = require("cors");
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

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:8080",
    credentials: true,
  })
);
app.use(express.json());

let connectionPromise;

app.use(async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      if (!process.env.MONGO_URI) {
        throw new Error("MONGO_URI environment variable is required");
      }

      if (!connectionPromise) {
        connectionPromise = mongoose
          .connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 5000,
            family: 4,
          })
          .finally(() => {
            connectionPromise = undefined;
          });
      }

      await connectionPromise;
    }

    next();
  } catch (error) {
    console.error("MongoDB connection failed:", error);
    res.status(503).json({ message: "Database unavailable" });
  }
});

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "School backend API is running",
  });
});

app.use("/api/auth", authRoutes);

// API CLASSES
app.use("/api/classes", classRoutes);

// API BULLETIN
app.use("/api/bulletins", bulletinRoutes);

// API EVALUATION
app.use("/api/evaluations", evaluationRoutes);

// API GRADE
app.use("/api/grades", gradeRoutes);

// API PERIOD
app.use("/api/periods", periodRoutes);

// API STUDENT
app.use("/api/students", studentRoutes);

// API TEACHER
app.use("/api/teacher", teacherRoutes);

// API SUBJECT
app.use("/api/subjects", subjectRoutes);

// API NOTIFICATIONS
app.use("/api/notifications", notificationRoutes);

// API USERS
app.use("/api/users", userRoutes);

// API ADMIN DASHBOARD
app.use("/api/admin/dashboard", dashboardRoutes);

// API CYCLES & CLASS SUBJECTS
app.use("/api/cycles", cycleRoutes);
app.use("/api/class-subjects", classSubjectRoutes);
app.use("/api/school-years", schoolYearRoutes);

module.exports = app;
