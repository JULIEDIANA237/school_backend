const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { startApp, seedSchool, tokenFor } = require("./helpers");
const User = require("../src/modules/users/user.model");
const Student = require("../src/modules/students/student.model");
const Notification = require("../src/modules/notifications/notification.model");

describe("Programmes Officiels & Cahier de Textes (Cameroun)", () => {
  let app, stop, data;
  let adminToken, teacherToken, teacherBToken, censeurToken, parentToken;
  let createdProgramId;

  before(async () => {
    ({ app, stop } = await startApp());
    data = await seedSchool();
    adminToken = tokenFor(data.admin);
    teacherToken = tokenFor(data.teacherA); // prof de maths en 6e A
    teacherBToken = tokenFor(data.teacherB);
    parentToken = tokenFor(data.parent1);

    // Censeur
    const censeur = await User.create({
      role: "teacher",
      functions: ["censeur"],
      firstName: "Paul",
      lastName: "Censeur",
      email: "censeur_prog@test.cm",
      password: "pass",
    });
    censeurToken = tokenFor(censeur);
  });

  after(async () => {
    await stop();
  });

  /* -------------------------------------------------------------
     1. Création / Gestion du Programme Officiel par le Proviseur
     ------------------------------------------------------------- */
  it("Le proviseur/admin crée un programme officiel pour la 6e A en Mathématiques", async () => {
    const res = await request(app)
      .post("/api/programs")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        classId: String(data.classA._id),
        subjectId: String(data.math._id),
        schoolYearId: String(data.year._id),
        title: "Programme Officiel de Mathématiques 6e",
        chapters: [
          {
            sequenceId: String(data.s1._id),
            sequenceName: "Séquence 1 (Sem. 1-6)",
            order: 1,
            title: "Nombres entiers et décimaux",
            objectives: "Écriture, comparaison et opérations élémentaires",
            estimatedSessions: 3,
          },
          {
            sequenceId: String(data.s1._id),
            sequenceName: "Séquence 1 (Sem. 1-6)",
            order: 2,
            title: "Droites perpendiculaires et parallèles",
            objectives: "Constructions géométriques à la règle et à l'équerre",
            estimatedSessions: 2,
          },
          {
            sequenceId: String(data.s2._id),
            sequenceName: "Séquence 2",
            order: 3,
            title: "Fractions et partages",
            objectives: "Notion de fraction et simplification",
            estimatedSessions: 4,
          },
        ],
        notes: "Conforme aux programmes officiels MINESEC 2025/2026",
      });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.ok(res.body.program._id);
    assert.equal(res.body.program.chapters.length, 3);
    assert.equal(res.body.program.totalEstimatedSessions, 9);
    // Vérifie que le prof de maths (teacherA) a été automatiquement assigné
    assert.equal(String(res.body.program.teacherId), String(data.teacherA._id));
    createdProgramId = res.body.program._id;
  });

  it("Un enseignant ne peut pas créer de programme officiel (réservé admin/censeur)", async () => {
    const res = await request(app)
      .post("/api/programs")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        classId: String(data.classA._id),
        subjectId: String(data.math._id),
        schoolYearId: String(data.year._id),
        chapters: [],
      });
    assert.equal(res.status, 403);
  });

  /* -------------------------------------------------------------
     2. Consultation du programme par l'Enseignant
     ------------------------------------------------------------- */
  it("L'enseignant consulte le programme officiel assigné à sa classe et matière", async () => {
    const res = await request(app)
      .get(`/api/programs/class/${data.classA._id}/subject/${data.math._id}?schoolYearId=${data.year._id}`)
      .set("Authorization", `Bearer ${teacherToken}`);

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.program);
    assert.equal(res.body.program._id, createdProgramId);
    assert.equal(res.body.program.chapters.length, 3);
    assert.equal(res.body.program.overallProgressPercent, 0);
  });

  /* -------------------------------------------------------------
     3. Remplissage du Cahier de Textes lié au Programme + Signature
     ------------------------------------------------------------- */
  let createdLogId;

  it("L'enseignant remplit une séance du cahier de textes avec devoirs et la signe", async () => {
    // Récupérer le 1er chapitre
    const progRes = await request(app)
      .get(`/api/programs/detail/${createdProgramId}`)
      .set("Authorization", `Bearer ${teacherToken}`);
    const firstChapter = progRes.body.program.chapters[0];

    const res = await request(app)
      .post("/api/schedule/lesson-logs")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        classId: String(data.classA._id),
        subjectId: String(data.math._id),
        schoolYearId: String(data.year._id),
        date: "2026-10-26",
        startTime: "07:30",
        endTime: "09:10",
        title: firstChapter.title,
        chapterId: String(firstChapter._id),
        chapterTitle: firstChapter.title,
        content: "Exercices d'application sur la comparaison des nombres décimaux.",
        homework: "Exercices 4 et 5 page 28",
        dueDate: "2026-10-30",
        status: "DONE",
        signed: true, // Signature officielle
      });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.signed, true);
    assert.ok(res.body.signedAt);
    assert.equal(res.body.title, firstChapter.title);
    createdLogId = res.body._id;

    // Attendre un tick pour la notification asynchrone des parents
    await new Promise((r) => setTimeout(r, 100));

    // Vérifier que le parent de la classe (parent1) a reçu une notification de devoir
    const notifs = await Notification.find({ user: data.parent1._id });
    assert.ok(notifs.length > 0, "Le parent aurait dû recevoir une notification de devoirs");
    const hwNotif = notifs.find((n) => n.title.includes("Devoir"));
    assert.ok(hwNotif);
    assert.ok(hwNotif.message.includes("Exercices 4 et 5 page 28"));
  });

  it("Une séance signée est verrouillée contre les modifications non-admin", async () => {
    const res = await request(app)
      .put(`/api/schedule/lesson-logs/${createdLogId}`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        content: "Tentative de modification illicite",
      });

    assert.equal(res.status, 403);
    assert.ok(res.body.error.includes("signée"));
  });

  it("Une séance signée ne peut pas être supprimée par l'enseignant", async () => {
    const res = await request(app)
      .delete(`/api/schedule/lesson-logs/${createdLogId}`)
      .set("Authorization", `Bearer ${teacherToken}`);

    assert.equal(res.status, 403);
  });

  /* -------------------------------------------------------------
     4. Suivi de Progression par le Censeur avec les Programmes
     ------------------------------------------------------------- */
  it("Le censeur consulte la progression globale et voit le programme officiel associé", async () => {
    const res = await request(app)
      .get(`/api/schedule/censeur/progression?schoolYearId=${data.year._id}&classId=${data.classA._id}`)
      .set("Authorization", `Bearer ${censeurToken}`);

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(Array.isArray(res.body.progressionRows));

    const mathRow = res.body.progressionRows.find(
      (r) => String(r.subjectId) === String(data.math._id)
    );
    assert.ok(mathRow);
    assert.equal(mathRow.hasOfficialProgram, true);
    assert.equal(mathRow.totalChapters, 3);
    assert.equal(mathRow.totalEstimatedSessions, 9);
    assert.equal(mathRow.doneCount, 1);
  });

  it("Le détail du programme reflète l'avancement réel (1 séance faite)", async () => {
    const res = await request(app)
      .get(`/api/programs/detail/${createdProgramId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.program.totalSessionsDone, 1);
    assert.ok(res.body.program.overallProgressPercent > 0);
    // Le 1er chapitre a 1 séance faite sur 3 estimées = 33%
    const ch1 = res.body.program.chapters[0];
    assert.equal(ch1.sessionsDoneCount, 1);
    assert.equal(ch1.completionRate, 33);
  });
});

