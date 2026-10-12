const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const xlsx = require("xlsx");
const { startApp, seedSchool, tokenFor, PASSWORD } = require("./helpers");

let app;
let stop;
let d; // jeu de données
let auth; // en-têtes par utilisateur

const as = (user) => ({ Authorization: `Bearer ${tokenFor(user)}` });

before(async () => {
  ({ app, stop } = await startApp());
  d = await seedSchool();
  auth = Object.fromEntries(
    ["admin", "secretary", "teacherA", "teacherB", "teacherC", "parent1", "parent2"].map((k) => [k, as(d[k])]),
  );
});

after(async () => {
  await stop();
});

const Bulletin = () => require("../src/modules/bulletins/bulletin.model");

describe("Authentification", () => {
  test("connexion par téléphone et email, mauvais mot de passe refusé", async () => {
    const byPhone = await request(app).post("/api/auth/login").send({ email: "690000001", password: PASSWORD });
    assert.equal(byPhone.status, 200);
    assert.equal(byPhone.body.user.role, "parent");
    assert.equal(byPhone.body.user.password, undefined);

    const byEmail = await request(app).post("/api/auth/login").send({ email: "PAUL@test.cm", password: PASSWORD });
    assert.equal(byEmail.status, 200);

    const wrong = await request(app).post("/api/auth/login").send({ email: "690000001", password: "nope-nope" });
    assert.equal(wrong.status, 401);
  });

  test("le jeton d'un compte supprimé est refusé", async () => {
    const User = require("../src/modules/users/user.model");
    const ghost = await User.create({ role: "admin", firstName: "G", lastName: "H", email: "ghost@test.cm", password: "x" });
    const headers = as(ghost);
    await User.deleteOne({ _id: ghost._id });
    const res = await request(app).get("/api/users").set(headers);
    assert.equal(res.status, 401);
  });

  test("le rôle vient de la base, pas du jeton", async () => {
    const jwt = require("jsonwebtoken");
    const forged = jwt.sign({ id: String(d.parent1._id), role: "admin" }, process.env.JWT_SECRET);
    const res = await request(app).get("/api/users").set({ Authorization: `Bearer ${forged}` });
    assert.equal(res.status, 403);
  });

  test("un changement de mot de passe invalide les anciens jetons", async () => {
    const User = require("../src/modules/users/user.model");
    const bcrypt = require("bcryptjs");
    const user = await User.create({
      role: "parent", firstName: "Rita", lastName: "T", email: "rita@test.cm", password: await bcrypt.hash(PASSWORD, 4),
    });
    const oldHeaders = as(user);
    // jeton émis dans une seconde antérieure au changement
    await new Promise((r) => setTimeout(r, 1100));

    const res = await request(app)
      .put("/api/users/me/password")
      .set(oldHeaders)
      .send({ oldPassword: PASSWORD, newPassword: "NouveauMdp2026" });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);

    assert.equal((await request(app).get("/api/users/me").set(oldHeaders)).status, 401);
    assert.equal(
      (await request(app).get("/api/users/me").set({ Authorization: `Bearer ${res.body.token}` })).status,
      200,
    );
  });

  test("compte créé par l'administration : mot de passe provisoire à changer avant toute autre action", async () => {
    const created = await request(app)
      .post("/api/users")
      .set(auth.admin)
      .send({ role: "teacher", firstName: "Nadia", lastName: "K", email: "nadia@test.cm" });
    assert.equal(created.status, 201);
    assert.match(created.body.temporaryPassword, /^[A-Za-z0-9]{10}$/);

    const login = await request(app).post("/api/auth/login").send({ email: "nadia@test.cm", password: created.body.temporaryPassword });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.mustChangePassword, true);
    const headers = { Authorization: `Bearer ${login.body.token}` };

    const blocked = await request(app).get("/api/teacher/me").set(headers);
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.code, "PASSWORD_CHANGE_REQUIRED");

    const changed = await request(app)
      .put("/api/users/me/password")
      .set(headers)
      .send({ oldPassword: created.body.temporaryPassword, newPassword: "MonMotDePasse2026" });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.user.mustChangePassword, false);

    const ok = await request(app).get("/api/teacher/me").set({ Authorization: `Bearer ${changed.body.token}` });
    assert.equal(ok.status, 200);
  });
});

describe("Contrôles d'accès", () => {
  test("un parent ne peut pas consulter les moyennes d'un élève, et aucun bulletin n'est créé", async () => {
    const url = `/api/grades/averages/student/${d.student2._id}/class/${d.classA._id}/period/${d.s1._id}`;
    assert.equal((await request(app).get(url).set(auth.parent1)).status, 403);
    assert.equal(await Bulletin().countDocuments(), 0);
  });

  test("le calcul des moyennes à la volée n'écrit aucun bulletin", async () => {
    const url = `/api/grades/averages/student/${d.student2._id}/class/${d.classA._id}/period/${d.s1._id}`;
    const res = await request(app).get(url).set(auth.teacherA);
    assert.equal(res.status, 200);
    assert.equal(res.body.generalAverage, 10); // français non classé
    assert.equal(await Bulletin().countDocuments(), 0);
  });

  test("un enseignant ne voit pas les notes d'une classe où il n'enseigne pas", async () => {
    const res = await request(app).get(`/api/grades/class/${d.classA._id}`).set(auth.teacherC);
    assert.equal(res.status, 403);
    assert.equal((await request(app).get(`/api/classes/${d.classA._id}/students`).set(auth.teacherC)).status, 403);
  });

  test("un enseignant non principal ne reçoit que ses propres évaluations", async () => {
    const res = await request(app).get(`/api/grades/class/${d.classA._id}`).query({ periodId: String(d.s1._id) }).set(auth.teacherB);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.evaluations.map((e) => e.name), ["Dictée"]);
  });

  test("un enseignant ne voit que ses classes dans GET /classes", async () => {
    const res = await request(app).get("/api/classes").set(auth.teacherC);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.map((c) => c.name), ["6e B"]);
  });

  test("un enseignant ne peut pas publier l'évaluation d'un collègue", async () => {
    assert.equal((await request(app).patch(`/api/evaluations/${d.evalMath._id}/publish`).set(auth.teacherB)).status, 403);
    const own = await request(app).patch(`/api/evaluations/${d.evalMath._id}/publish`).set(auth.teacherA);
    assert.equal(own.status, 200);
    assert.equal(own.body.data.isPublished, true);
    await request(app).patch(`/api/evaluations/${d.evalMath._id}/unpublish`).set(auth.teacherA);
  });

  test("création d'évaluation : affectation obligatoire, séquence obligatoire, statut imposé", async () => {
    const base = { name: "Interro", class: d.classA._id, subject: d.math._id, period: d.s1._id };
    assert.equal((await request(app).post("/api/evaluations").set(auth.teacherB).send(base)).status, 403);
    assert.equal(
      (await request(app).post("/api/evaluations").set(auth.teacherA).send({ ...base, period: d.t1._id })).status,
      400,
    );
    const ok = await request(app).post("/api/evaluations").set(auth.teacherA).send({ ...base, isPublished: true });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.data.isPublished, false);
    assert.equal(ok.body.data.title, "Interro");
    await request(app).delete(`/api/evaluations/${ok.body.data.id}`).set(auth.teacherA);
  });

  test("saisie de note : élève d'une autre classe et note hors barème refusés", async () => {
    const send = (body) => request(app).post("/api/grades").set(auth.teacherA).send({ evaluationId: d.evalMath._id, ...body });
    assert.equal((await send({ studentId: d.student3._id, score: 12 })).status, 400);
    assert.equal((await send({ studentId: d.student1._id, score: 25 })).status, 400);
    assert.equal((await send({ studentId: d.student1._id, score: "abc" })).status, 400);
    assert.equal((await send({ studentId: d.student1._id, score: null })).status, 400);
    const ok = await send({ studentId: d.student1._id, score: "14" });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.score, 14);
  });

  test("GET /classes/:id/teachers fonctionne et regroupe les matières", async () => {
    const res = await request(app).get(`/api/classes/${d.classA._id}/teachers`).set(auth.admin);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.map((t) => t.firstName).sort(), ["Alice", "Bruno"]);
  });
});

describe("Bulletins", () => {
  let bulletin1;

  test("génération : matières non évaluées exclues, rangs calculés", async () => {
    const res = await request(app)
      .post("/api/bulletins/generate")
      .set(auth.admin)
      .send({ classId: d.classA._id, periodId: d.s1._id });
    assert.equal(res.status, 200, res.body.error);
    assert.equal(res.body.generated, 2);

    const b1 = await Bulletin().findOne({ student: d.student1._id, period: d.s1._id }).lean();
    const b2 = await Bulletin().findOne({ student: d.student2._id, period: d.s1._id }).lean();
    assert.equal(b1.generalAverage, 13.33); // (14×4 + 12×2) / 6
    assert.equal(b2.generalAverage, 10); // français non classé (avant : (10×4 + 0×2)/6 = 6.67)
    assert.equal(b2.averages.find((a) => String(a.subject) === String(d.french._id)).average, null);
    assert.equal(b1.rank, 1);
    assert.equal(b2.rank, 2);
    assert.equal(b1.classifiedCount, 2);
    bulletin1 = b1;
  });

  test("appréciation : réservée au professeur principal, conservée à la régénération", async () => {
    const url = `/api/bulletins/${bulletin1._id}`;
    assert.equal((await request(app).patch(url).set(auth.teacherB).send({ teacherComment: "Hack" })).status, 403);
    assert.equal((await request(app).patch(url).set(auth.teacherA).send({ decisions: ["XX"] })).status, 400);
    const ok = await request(app).patch(url).set(auth.teacherA).send({ teacherComment: "Bon travail", decisions: ["TH"] });
    assert.equal(ok.status, 200);

    await request(app).post("/api/bulletins/generate").set(auth.admin).send({ classId: d.classA._id, periodId: d.s1._id });
    const after = await Bulletin().findById(bulletin1._id).lean();
    assert.equal(after.teacherComment, "Bon travail");
    assert.deepEqual(after.decisions, ["TH"]);
  });

  test("bulletin publié : figé, visible du seul parent concerné, QR code vérifiable", async () => {
    const pub = await request(app).patch(`/api/bulletins/${bulletin1._id}/publish`).set(auth.admin);
    assert.equal(pub.status, 200);

    const regen = await request(app).post("/api/bulletins/generate").set(auth.admin).send({ classId: d.classA._id, periodId: d.s1._id });
    assert.equal(regen.status, 409);
    assert.equal((await request(app).patch(`/api/bulletins/${bulletin1._id}`).set(auth.admin).send({ teacherComment: "x" })).status, 409);

    assert.equal((await request(app).get(`/api/bulletins/${bulletin1._id}`).set(auth.parent2)).status, 404);
    const view = await request(app).get(`/api/bulletins/${bulletin1._id}`).set(auth.parent1);
    assert.equal(view.status, 200);
    assert.match(view.body.verificationCode, /^[a-f0-9]{24}$/);
    assert.equal(view.body.grades.find((g) => g.subject === String(d.french._id)).appreciation, "Assez Bien");

    const verified = await request(app).get(`/api/bulletins/verify/${bulletin1._id}/${view.body.verificationCode}`);
    assert.equal(verified.status, 200);
    assert.equal(verified.body.valid, true);
    assert.equal(verified.body.generalAverage, 13.33);

    const forged = await request(app).get(`/api/bulletins/verify/${bulletin1._id}/${"0".repeat(24)}`);
    assert.equal(forged.status, 404);
    assert.equal(forged.body.valid, false);

    await request(app).post("/api/bulletins/bulk-unpublish").set(auth.admin).send({ classId: d.classA._id, periodId: d.s1._id });
  });

  test("publication groupée : toute la classe publiée en une fois, une notification par parent", async () => {
    const Notification = require("../src/modules/notifications/notification.model");
    const since = new Date();
    const res = await request(app).post("/api/bulletins/bulk-publish").set(auth.admin).send({ classId: d.classA._id, periodId: d.s1._id });
    assert.equal(res.status, 200, res.body.error);

    const bulletins = await Bulletin().find({ class: d.classA._id, period: d.s1._id }).lean();
    assert.equal(bulletins.length, 2);
    assert.ok(bulletins.every((b) => b.isPublished && b.publishedAt));

    const notifications = await Notification.find({ title: "Bulletin publié", createdAt: { $gte: since } }).lean();
    assert.deepEqual(notifications.map((n) => String(n.user)).sort(), [String(d.parent1._id), String(d.parent2._id)].sort());
    const forParent1 = notifications.find((n) => String(n.user) === String(d.parent1._id));
    assert.equal(forParent1.link, `/parent/bulletins/${bulletin1._id}`);

    await request(app).post("/api/bulletins/bulk-unpublish").set(auth.admin).send({ classId: d.classA._id, periodId: d.s1._id });
  });

  test("bulletin trimestriel calculé depuis les séquences, sans 0 pour une séquence non notée", async () => {
    const Evaluation = require("../src/modules/evaluations/evaluation.model");
    const Grade = require("../src/modules/grades/grade.model");
    const evalS2 = await Evaluation.create({
      name: "Contrôle 2", subject: d.math._id, class: d.classA._id, period: d.s2._id, teacher: d.teacherA._id, maxScore: 20,
    });
    await Grade.create({ student: d.student1._id, evaluation: evalS2._id, score: 16 });

    const res = await request(app).post("/api/bulletins/generate").set(auth.admin).send({ classId: d.classA._id, periodId: d.t1._id });
    assert.equal(res.status, 200, res.body.error);
    const tri = await Bulletin().findOne({ student: d.student1._id, period: d.t1._id }).lean();
    const math = tri.averages.find((a) => String(a.subject) === String(d.math._id));
    const french = tri.averages.find((a) => String(a.subject) === String(d.french._id));
    assert.equal(math.average, 15); // (14 + 16) / 2
    assert.equal(french.average, 12); // seule la séquence 1 est notée
    assert.equal(tri.generalAverage, 14); // (15×4 + 12×2) / 6
    assert.deepEqual(math.sequenceMarks.map((m) => m.average), [14, 16]);
  });
});

describe("Périodes", () => {
  test("une séquence sans trimestre parent est refusée", async () => {
    const res = await request(app).post("/api/periods").set(auth.admin).send({
      name: "Séquence X", type: "SEQUENCE", year: "2025-2026", startDate: "2025-09-02", endDate: "2025-09-10",
    });
    assert.equal(res.status, 400);
  });

  test("une période dans une année scolaire inconnue est refusée", async () => {
    const res = await request(app).post("/api/periods").set(auth.admin).send({
      name: "Trimestre Z", type: "TRIMESTRE", year: "2030-2031", startDate: "2030-09-01", endDate: "2030-12-01",
    });
    assert.equal(res.status, 400);
  });

  test("clôturer un trimestre verrouille la saisie dans ses séquences", async () => {
    const close = await request(app).patch(`/api/periods/${d.t1._id}/closure`).set(auth.admin).send({ isClosed: true });
    assert.equal(close.status, 200);
    const res = await request(app)
      .post("/api/grades")
      .set(auth.teacherA)
      .send({ evaluationId: d.evalMath._id, studentId: d.student2._id, score: 11 });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, "PERIOD_CLOSED");
    await request(app).patch(`/api/periods/${d.t1._id}/closure`).set(auth.admin).send({ isClosed: false });
  });
});

describe("Années scolaires", () => {
  test("création, format validé et bascule de l'année courante", async () => {
    assert.equal((await request(app).post("/api/school-years").set(auth.admin).send({ name: "2026-2028" })).status, 400);
    const created = await request(app).post("/api/school-years").set(auth.admin).send({ name: "2026-2027" });
    assert.equal(created.status, 201);
    const current = await request(app).patch(`/api/school-years/${created.body._id}/current`).set(auth.admin);
    assert.equal(current.status, 200);
    const list = await request(app).get("/api/school-years").set(auth.admin);
    assert.deepEqual(list.body.filter((y) => y.isCurrent).map((y) => y.name), ["2026-2027"]);
    await request(app).patch(`/api/school-years/${d.year._id}/current`).set(auth.admin);
  });
});

describe("Limitation de débit partagée (MongoDB)", () => {
  test("les compteurs sont stockés en base et se réinitialisent", async () => {
    const { MongoRateLimitStore } = require("../src/utils/rateLimit");
    const store = new MongoRateLimitStore("test");
    store.init({ windowMs: 60_000 });
    assert.equal((await store.increment("1.2.3.4")).totalHits, 1);
    assert.equal((await store.increment("1.2.3.4")).totalHits, 2);
    await store.decrement("1.2.3.4");
    assert.equal((await store.increment("1.2.3.4")).totalHits, 2);
    await store.resetKey("1.2.3.4");
    assert.equal((await store.increment("1.2.3.4")).totalHits, 1);
  });
});

describe("Import Excel des élèves", () => {
  test("colonnes reconnues sans confusion et mot de passe provisoire par parent", async () => {
    const sheet = xlsx.utils.aoa_to_sheet([
      ["Prénom", "Nom", "Date de naissance", "Lieu de naissance", "Classe", "Nom parent", "Téléphone"],
      ["Jean", "Essomba", "12/03/2014", "Yaoundé", "6e B", "Essomba", "699 11 22 33"],
    ]);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, sheet, "Eleves");
    const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });

    const res = await request(app)
      .post("/api/students/import")
      .set(auth.admin)
      .field("schoolYearId", String(d.year._id))
      .attach("file", buffer, "eleves.xlsx");
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.studentsCreated, 1, JSON.stringify(res.body.errors));
    assert.equal(res.body.credentials.length, 1);
    assert.match(res.body.credentials[0].temporaryPassword, /^[A-Za-z0-9]{10}$/);
    assert.equal(res.body.credentials[0].login, "699112233");

    const Student = require("../src/modules/students/student.model");
    const User = require("../src/modules/users/user.model");
    const student = await Student.findOne({ firstName: "Jean" }).lean();
    assert.equal(student.lastName, "Essomba"); // avant : « Nom » pouvait prendre la colonne « Prénom »
    assert.equal(student.placeOfBirth, "Yaoundé"); // avant : recevait la date de naissance
    assert.equal(new Date(student.dateOfBirth).toISOString().slice(0, 10), "2014-03-12");
    const parent = await User.findOne({ phone: "699112233" }).lean();
    assert.equal(parent.mustChangePassword, true);
  });

  const workbookBuffer = (rows) => {
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(rows), "Feuille");
    return xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
  };
  const upload = async (url, rows) => {
    const res = await request(app)
      .post(url)
      .set(auth.admin)
      .field("schoolYearId", String(d.year._id))
      .attach("file", workbookBuffer(rows), "import.xlsx");
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body;
  };

  test("fratrie sur un seul compte parent, parent existant réutilisé, réimport sans doublon", async () => {
    const rows = [
      ["Nom", "Prénom", "Date de naissance", "Classe", "Nom parent", "Prénom parent", "Téléphone parent"],
      ["Ngono", "Alice", "01/02/2015", "6e A", "Ngono", "Marie", "699 55 00 01"],
      ["Ngono", "Bruno", "03/04/2015", "6e B", "Ngono", "Marie", "699550001"],
      ["Mbida", "Carl", "05/06/2015", "6e A", "Test", "Paul", "690000001"], // parent déjà inscrit
      ["Ngono", "Alice", "01/02/2015", "6e A", "Ngono", "Marie", "699550001"], // doublon dans le fichier
    ];
    const first = await upload("/api/students/import", rows);
    assert.equal(first.studentsCreated, 3, JSON.stringify(first.errors));
    assert.equal(first.parentsCreated, 1);
    assert.equal(first.credentials.length, 1);
    assert.equal(first.errors.length, 1);
    assert.match(first.errors[0], /^Ligne 5: .*déjà inscrit/);

    const Student = require("../src/modules/students/student.model");
    const byName = Object.fromEntries(
      (await Student.find({ lastName: { $in: ["Ngono", "Mbida"] } }).lean()).map((s) => [s.firstName, s]),
    );
    assert.equal(String(byName.Alice.parents[0]), String(byName.Bruno.parents[0]));
    assert.equal(String(byName.Carl.parents[0]), String(d.parent1._id));
    assert.equal(new Set(Object.values(byName).map((s) => s.matricule)).size, 3);

    const again = await upload("/api/students/import", rows);
    assert.equal(again.studentsCreated, 0);
    assert.equal(again.parentsCreated, 0);
    assert.equal(again.errors.length, 4);
  });

  test("coefficients : la dernière ligne d'un doublon l'emporte, les erreurs gardent leur ligne", async () => {
    const result = await upload("/api/class-subjects/import-coefficients", [
      ["Classe", "Matière", "Coefficient", "Groupe"],
      ["6e B", "Français", 3, 1],
      ["6e B", "FR", 5, 2],
      ["6e B", "Astronomie", 2, 1],
    ]);
    assert.equal(result.created, 1);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /^Ligne 4: Matière « Astronomie » non trouvée/);

    const ClassSubject = require("../src/modules/classes/classSubject.model");
    const saved = await ClassSubject.findOne({ classId: d.classB._id, subjectId: d.french._id }).lean();
    assert.equal(saved.coefficient, 5);
    assert.equal(saved.group, 2);
  });

  test("un fichier qui n'est pas un tableur est refusé", async () => {
    const res = await request(app)
      .post("/api/students/import")
      .set(auth.admin)
      .attach("file", Buffer.from("hello"), "notes.txt");
    assert.equal(res.status, 400);
  });
});

describe("Espace enseignant", () => {
  test("tableau de bord en un appel : ses classes et ses évaluations uniquement", async () => {
    const res = await request(app).get(`/api/teacher/dashboard?schoolYearId=${d.year._id}`).set(auth.teacherA);
    assert.equal(res.status, 200, res.body.error);
    assert.deepEqual(res.body.classes.map((c) => c.class.name), ["6e A"]);
    assert.ok(res.body.evaluations.length > 0);
    assert.ok(res.body.evaluations.every((e) => String(e.teacher?._id ?? e.teacher) === String(d.teacherA._id)));
    const evalMath = res.body.evaluations.find((e) => String(e._id) === String(d.evalMath._id));
    assert.ok(evalMath && evalMath.gradesCount > 0);

    assert.equal((await request(app).get("/api/teacher/dashboard").set(auth.admin)).status, 403);
  });

  test("notification de création : classe, matière et période précisées, lien vers la saisie", async () => {
    const res = await request(app)
      .post("/api/evaluations")
      .set(auth.teacherA)
      .send({ name: "Interro surprise", classId: d.classA._id, subjectId: d.math._id, periodId: d.s1._id });
    assert.ok(res.status < 300, JSON.stringify(res.body));

    const Notification = require("../src/modules/notifications/notification.model");
    const notification = await Notification.findOne({ user: d.teacherA._id }).sort({ createdAt: -1 }).lean();
    assert.equal(notification.title, "Évaluation créée en 6e A");
    assert.match(notification.message, /« Interro surprise » \(Mathématiques, 6e A, Séquence 1\)/);
    assert.equal(notification.link, `/teacher/grades?class=${d.classA._id}&subject=${d.math._id}`);
  });
});
