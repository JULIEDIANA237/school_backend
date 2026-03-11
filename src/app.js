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

const app = express();

app.use(cors());
app.use(express.json());

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

const MONGO_URI = "mongodb+srv://Julie237:Module237@cluster0.e256eth.mongodb.net/school_api?appName=Cluster0";

console.log("🟡 MONGO - Tentative de connexion...");
console.log("🟡 MONGO URI =", MONGO_URI.replace(/:\/\/.*@/, "://<hidden>@"));

mongoose
  .connect(MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
  })
  .then(() => {
    console.log("🟢 MONGO - Connexion réussie");
  })
  .catch((err) => {
    console.error("🔴 MONGO - Connexion échouée");
    console.error("🔴 NAME:", err.name);
    console.error("🔴 MESSAGE:", err.message);
    console.error("🔴 STACK:", err.stack);
    process.exit(1);
  });

module.exports = app;
