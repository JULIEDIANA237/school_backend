const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { startApp, seedSchool, tokenFor } = require("./helpers");
const User = require("../src/modules/users/user.model");
const Student = require("../src/modules/students/student.model");
const ClassSubject = require("../src/modules/classes/classSubject.model");

describe("Module 7 — Emploi du temps et cahier de textes", () => {
  let app;
  let stop;
  let data;
  let adminToken;
  let teacherToken;
  let censeurToken;
  let studentToken;
  let studentUser;
  let censeurUser;

  before(async () => {
    ({ app, stop } = await startApp());
    data = await seedSchool();
    adminToken = tokenFor(data.admin);
    teacherToken = tokenFor(data.teacherA);

    // Créer un utilisateur Censeur (enseignant avec fonction censeur)
    censeurUser = await User.create({
      role: "teacher",
      functions: ["censeur"],
      firstName: "Cyrille",
      lastName: "Censeur",
      email: "censeur@test.cm",
      password: "dummy-password",
    });
    censeurToken = tokenFor(censeurUser);

    // Créer un compte utilisateur pour un élève et le lier
    studentUser = await User.create({
      role: "student",
      firstName: data.student1.firstName,
      lastName: data.student1.lastName,
      email: "eleve1@test.cm",
      password: "dummy-password",
    });
    await Student.findByIdAndUpdate(data.student1._id, { userId: studentUser._id });
    studentToken = tokenFor(studentUser);

    // Définir un quota de 4h pour les maths en 6e A
    await ClassSubject.findOneAndUpdate(
      { classId: data.classA._id, subjectId: data.math._id },
      { weeklyHours: 4 }
    );
  });

  after(async () => {
    await stop();
  });

  let createdRoomId;

  it("Gestion des salles : création et consultation", async () => {
    const res = await request(app)
      .post("/api/schedule/rooms")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Salle 101",
        code: "S101",
        capacity: 55,
        building: "Bâtiment A",
        type: "CLASSROOM",
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.name, "Salle 101");
    createdRoomId = res.body._id;

    // Doublon refusé
    const dupRes = await request(app)
      .post("/api/schedule/rooms")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Salle 101" });
    assert.equal(dupRes.status, 409);

    // Consultation
    const listRes = await request(app)
      .get("/api/schedule/rooms")
      .set("Authorization", `Bearer ${teacherToken}`);
    assert.equal(listRes.status, 200);
    assert(listRes.body.some((r) => r.name === "Salle 101"));
  });

  it("Gestion des créneaux horaires : initialisation par défaut", async () => {
    const res = await request(app)
      .get("/api/schedule/time-slots")
      .set("Authorization", `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert(res.body.length > 0, "Les créneaux par défaut doivent être initialisés");
    assert.equal(res.body[0].name, "M1");
  });

  let scheduleEntry1Id;

  it("Saisie de l'emploi du temps par classe : enregistrement réussi", async () => {
    const res = await request(app)
      .post("/api/schedule/entries")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        classId: data.classA._id,
        subjectId: data.math._id,
        teacherId: data.teacherA._id,
        roomId: createdRoomId,
        schoolYearId: data.year._id,
        dayOfWeek: 1, // Lundi
        startTime: "07:30",
        endTime: "09:20",
        durationHours: 2,
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.classId.name, "6e A");
    assert.equal(res.body.subjectId.name, "Mathématiques");
    scheduleEntry1Id = res.body._id;
  });

  it("Refus des conflits : enseignant occupé deux fois", async () => {
    // Tenter de planifier le même prof (teacherA) dans la classe 6e B sur le même créneau lundi 08h00-09h00
    const res = await request(app)
      .post("/api/schedule/entries")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        classId: data.classB._id,
        subjectId: data.math._id,
        teacherId: data.teacherA._id,
        schoolYearId: data.year._id,
        dayOfWeek: 1,
        startTime: "08:00",
        endTime: "09:00",
      });

    assert.equal(res.status, 409);
    assert.match(res.body.error, /Conflit enseignant/);
  });

  it("Refus des conflits : salle occupée deux fois", async () => {
    // Tenter d'utiliser la Salle 101 avec une autre classe et un autre prof sur le même créneau
    const res = await request(app)
      .post("/api/schedule/entries")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        classId: data.classB._id,
        subjectId: data.french._id,
        teacherId: data.teacherB._id,
        roomId: createdRoomId,
        schoolYearId: data.year._id,
        dayOfWeek: 1,
        startTime: "08:00",
        endTime: "10:00",
      });

    assert.equal(res.status, 409);
    assert.match(res.body.error, /Conflit de salle/);
  });

  it("Refus des conflits : classe occupée deux fois", async () => {
    // Tenter d'ajouter un autre cours à la classe 6e A sur le même créneau
    const res = await request(app)
      .post("/api/schedule/entries")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        classId: data.classA._id,
        subjectId: data.french._id,
        teacherId: data.teacherB._id,
        schoolYearId: data.year._id,
        dayOfWeek: 1,
        startTime: "08:30",
        endTime: "09:30",
      });

    assert.equal(res.status, 409);
    assert.match(res.body.error, /Conflit de classe/);
  });

  it("Contrôle du volume horaire hebdomadaire de chaque matière", async () => {
    // La matière Maths a un quota de 4h. 2h sont déjà planifiées.
    // Tenter de planifier 3h supplémentaires (total = 5h > 4h) sans dérogation
    const res = await request(app)
      .post("/api/schedule/entries")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        classId: data.classA._id,
        subjectId: data.math._id,
        teacherId: data.teacherA._id,
        schoolYearId: data.year._id,
        dayOfWeek: 2, // Mardi
        startTime: "10:35",
        endTime: "13:20",
        durationHours: 3,
      });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /Dépassement du volume horaire hebdomadaire/);

    // Planifier 2h (total = 4h <= 4h) : doit être accepté
    const okRes = await request(app)
      .post("/api/schedule/entries")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        classId: data.classA._id,
        subjectId: data.math._id,
        teacherId: data.teacherA._id,
        schoolYearId: data.year._id,
        dayOfWeek: 2,
        startTime: "10:35",
        endTime: "12:25",
        durationHours: 2,
      });

    assert.equal(okRes.status, 201);
  });

  it("Vues par classe, par enseignant et par salle", async () => {
    // Vue par classe
    const classRes = await request(app)
      .get(`/api/schedule/class/${data.classA._id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(classRes.status, 200);
    assert.equal(classRes.body.entries.length, 2);
    assert(classRes.body.quotaSummary.some((q) => q.subjectCode === "MATH" && q.scheduledHours === 4));

    // Vue par enseignant
    const teacherRes = await request(app)
      .get(`/api/schedule/teacher/${data.teacherA._id}`)
      .set("Authorization", `Bearer ${teacherToken}`);
    assert.equal(teacherRes.status, 200);
    assert.equal(teacherRes.body.entries.length, 2);

    // Vue par salle
    const roomRes = await request(app)
      .get(`/api/schedule/room/${createdRoomId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(roomRes.status, 200);
    assert.equal(roomRes.body.entries.length, 1);
  });

  let createdLessonLogId;

  it("Cahier de textes : l'enseignant résume la séance et note les devoirs", async () => {
    const res = await request(app)
      .post("/api/schedule/lesson-logs")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        classId: data.classA._id,
        subjectId: data.math._id,
        schoolYearId: data.year._id,
        date: "2025-10-06",
        startTime: "07:30",
        endTime: "09:20",
        hoursDone: 2,
        status: "DONE",
        title: "Chapitre 1 : Les nombres premiers",
        content: "Définition, crible d'Ératosthène et exercices d'application 1 à 4 page 15.",
        homework: "Faire les exercices 5 et 6 page 16 sur le cahier d'exercices.",
        dueDate: "2025-10-13",
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.title, "Chapitre 1 : Les nombres premiers");
    assert.equal(res.body.status, "DONE");
    assert.equal(res.body.homework, "Faire les exercices 5 et 6 page 16 sur le cahier d'exercices.");
    createdLessonLogId = res.body._id;

    // Consultation des devoirs par les parents et élèves
    const hwRes = await request(app)
      .get(`/api/schedule/lesson-logs/homework?classId=${data.classA._id}`)
      .set("Authorization", `Bearer ${studentToken}`);
    assert.equal(hwRes.status, 200);
    assert(hwRes.body.some((h) => h.title.includes("nombres premiers")));
  });

  it("Séances du jour de l'enseignant avec statut cahier de textes et appel", async () => {
    // Le 2025-10-06 est un lundi (dayOfWeek = 1)
    const res = await request(app)
      .get(`/api/schedule/lesson-logs/today?date=2025-10-06`)
      .set("Authorization", `Bearer ${teacherToken}`);

    assert.equal(res.status, 200);
    assert(res.body.length > 0);
    assert(res.body.some((s) => s.lessonLog !== null));
  });

  it("Suivi de la progression par le censeur : séances faites, manquées et avancement", async () => {
    // Ajouter une séance manquée pour le test
    await request(app)
      .post("/api/schedule/lesson-logs")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        classId: data.classA._id,
        subjectId: data.math._id,
        schoolYearId: data.year._id,
        date: "2025-10-13",
        startTime: "07:30",
        endTime: "09:20",
        hoursDone: 0,
        status: "MISSED",
        title: "Séance annulée pour intempéries",
        missedReason: "Fortes pluies",
      });

    const res = await request(app)
      .get(`/api/schedule/censeur/progression?schoolYearId=${data.year._id}`)
      .set("Authorization", `Bearer ${censeurToken}`);

    assert.equal(res.status, 200);
    assert(res.body.totalDoneHours > 0);
    assert(res.body.totalMissedSessions >= 1);
    assert(res.body.progressionRows.length > 0);
    assert(res.body.missedAlerts.length >= 1);
  });

  it("Espace élève : profil, emploi du temps, devoirs et notes", async () => {
    // 1. Profil élève connecté
    const meRes = await request(app)
      .get("/api/schedule/student/me")
      .set("Authorization", `Bearer ${studentToken}`);
    assert.equal(meRes.status, 200);
    assert.equal(meRes.body.firstName, data.student1.firstName);

    // 2. Emploi du temps de sa classe
    const scheduleRes = await request(app)
      .get("/api/schedule/student/schedule")
      .set("Authorization", `Bearer ${studentToken}`);
    assert.equal(scheduleRes.status, 200);
    assert.equal(scheduleRes.body.entries.length, 2);

    // 3. Devoirs à faire
    const hwRes = await request(app)
      .get("/api/schedule/student/homework")
      .set("Authorization", `Bearer ${studentToken}`);
    assert.equal(hwRes.status, 200);
    assert(hwRes.body.length > 0);

    // 4. Notes de l'élève
    const gradesRes = await request(app)
      .get("/api/schedule/student/grades")
      .set("Authorization", `Bearer ${studentToken}`);
    assert.equal(gradesRes.status, 200);
    assert(Array.isArray(gradesRes.body.grades));
  });
});
