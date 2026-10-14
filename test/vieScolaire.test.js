const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { startApp, seedSchool, tokenFor } = require("./helpers");

let app;
let stop;
let d;
const as = (user) => ({ Authorization: `Bearer ${tokenFor(user)}` });
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAAABJRU5ErkJggg==";

const Record = () => require("../src/modules/vieScolaire/attendanceRecord.model");
const Bulletin = () => require("../src/modules/bulletins/bulletin.model");
const Class = () => require("../src/modules/classes/class.model");
const Notification = () => require("../src/modules/notifications/notification.model");
const today = () => require("../src/utils/school").schoolDay();
const shift = (day, n) => require("../src/modules/vieScolaire/days").shiftDay(day, n);
const notificationsOf = (user) => Notification().find({ user: user._id }).sort({ createdAt: 1, _id: 1 }).lean();
const lastNotification = async (user) => (await notificationsOf(user)).pop();

const api = "/api/vie-scolaire";
const previousParentEmails = process.env.PARENT_EMAILS;

before(async () => {
  process.env.PARENT_EMAILS = "false";
  ({ app, stop } = await startApp());
  d = await seedSchool();
});

after(async () => {
  process.env.PARENT_EMAILS = previousParentEmails;
  await stop();
});

const appel = (user, body) =>
  request(app)
    .post(`${api}/sessions`)
    .set(as(user))
    .send({ classId: d.classA._id, subjectId: d.math._id, day: today(), startTime: "08:00", hours: 2, entries: [], ...body });

const assign = (user, target, classIds) =>
  request(app).put(`${api}/supervisors/${target._id}`).set(as(user)).send({ classIds, schoolYearId: String(d.year._id) });

describe("Appel en classe", () => {
  test("l'enseignant fait l'appel de sa classe ; les parents des absents et des retards sont prévenus", async () => {
    const res = await appel(d.teacherA, {
      entries: [
        { studentId: d.student1._id, status: "absent" },
        { studentId: d.student2._id, status: "late", minutesLate: 15 },
      ],
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.session.absentCount, 1);
    assert.equal(res.body.session.lateCount, 1);
    assert.equal(res.body.session.studentCount, 2);
    assert.equal(res.body.notifiedParents, 2);

    const records = await Record().find({ class: d.classA._id, day: today() }).lean();
    const absence = records.find((r) => String(r.student) === String(d.student1._id));
    const late = records.find((r) => String(r.student) === String(d.student2._id));
    assert.equal(absence.kind, "absence");
    assert.equal(absence.hours, 2);
    assert.equal(late.kind, "late");
    assert.equal(late.minutesLate, 15);
    assert.equal(late.hours, 0);

    const toParent1 = await lastNotification(d.parent1);
    assert.match(toParent1.title, /^Absence : Awa/);
    assert.match(toParent1.message, /2 h d'absence/);
    assert.match(toParent1.message, /Mathématiques, 6e A/);
    assert.equal(toParent1.link, "/parent/vie-scolaire");
    const toParent2 = await lastNotification(d.parent2);
    assert.match(toParent2.title, /^Retard : Boris/);
    assert.match(toParent2.message, /15 min/);

    const roster = await request(app)
      .get(`${api}/roster`)
      .query({ classId: String(d.classA._id), day: today(), startTime: "08:00" })
      .set(as(d.teacherA));
    assert.equal(roster.status, 200);
    assert.equal(roster.body.students.length, 2);
    assert.equal(roster.body.entries.length, 2);
    assert.equal(roster.body.session.takenByMe, true);
    assert.equal(roster.body.supervising, false);
    assert.equal(roster.body.defaultHours, 1);
  });

  test("droits : autre classe, autre matière, parent, administration, date, créneau déjà pris", async () => {
    assert.equal((await appel(d.teacherC, {})).status, 403);
    assert.equal((await appel(d.teacherA, { subjectId: d.french._id })).status, 403);
    assert.equal((await appel(d.parent1, {})).status, 403);
    assert.equal((await appel(d.secretary, {})).status, 403);
    const byAdmin = await appel(d.admin, { startTime: "10:30" });
    assert.equal(byAdmin.status, 403, "l'administration ne fait pas l'appel");
    assert.equal(byAdmin.body.code, "VIE_SCOLAIRE_READ_ONLY");
    assert.equal((await appel(d.teacherA, { day: shift(today(), 1) })).status, 400);
    assert.equal((await appel(d.teacherA, { day: shift(today(), -10), startTime: "10:00" })).status, 403);
    assert.equal((await appel(d.teacherA, { startTime: "8h" })).status, 400);
    assert.equal((await appel(d.teacherA, { startTime: "11:00", entries: [{ studentId: d.student3._id, status: "absent" }] })).status, 400);
    const taken = await appel(d.teacherB, { subjectId: d.french._id });
    assert.equal(taken.status, 409);
    assert.match(taken.body.error, /déjà été fait par Alice/);
    // Un appel récent (moins de 7 jours) reste modifiable par l'enseignant
    assert.equal((await appel(d.teacherA, { day: shift(today(), -3), startTime: "10:00" })).status, 200);
  });

  test("corriger l'appel : correction envoyée à l'élève finalement présent, aucun doublon", async () => {
    const before1 = (await notificationsOf(d.parent1)).length;
    const before2 = (await notificationsOf(d.parent2)).length;

    const res = await appel(d.teacherA, { entries: [{ studentId: d.student2._id, status: "late", minutesLate: 15 }] });
    assert.equal(res.status, 200);
    assert.equal(res.body.removed, 1);
    assert.equal(await Record().countDocuments({ student: d.student1._id, day: today() }), 0);

    const after1 = await notificationsOf(d.parent1);
    assert.equal(after1.length, before1 + 1);
    assert.match(after1.pop().title, /^Correction : Awa était présent/);
    assert.equal((await notificationsOf(d.parent2)).length, before2, "retard inchangé : pas de nouvelle notification");

    // Retard transformé en absence : le parent est prévenu du changement
    await appel(d.teacherA, { entries: [{ studentId: d.student2._id, status: "absent" }] });
    assert.match((await lastNotification(d.parent2)).title, /^Absence : Boris/);
  });

  test("historique des appels de l'enseignant", async () => {
    const res = await request(app).get(`${api}/sessions/mine`).set(as(d.teacherA));
    assert.equal(res.status, 200);
    assert.ok(res.body.length >= 2);
    assert.equal(res.body[0].className, "6e A");
    assert.equal(res.body[0].subjectName, "Mathématiques");
  });
});

describe("Surveillant général : rôle dédié ou enseignant qui cumule la fonction", () => {
  test("l'administrateur crée un compte « surveillant général » ; le secrétariat ne le peut pas", async () => {
    const body = { role: "supervisor", firstName: "Sylvain", lastName: "Test", email: "sylvain@test.cm" };
    assert.equal((await request(app).post("/api/users").set(as(d.secretary)).send(body)).status, 403);
    const created = await request(app).post("/api/users").set(as(d.admin)).send({ ...body, functions: ["vie_scolaire"] });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.role, "supervisor");
    assert.deepEqual(created.body.functions, [], "le rôle suffit : pas de fonction à cumuler");
    assert.ok(created.body.temporaryPassword);
    d.sg = created.body;
    // Premier accès : mot de passe provisoire remplacé (sinon l'API exige ce changement)
    const sgDenied = await request(app).get(`${api}/dashboard`).set(as(d.sg));
    assert.equal(sgDenied.body.code, "PASSWORD_CHANGE_REQUIRED");
    await require("../src/modules/users/user.model").updateOne({ _id: d.sg._id }, { $set: { mustChangePassword: false } });

    assert.equal((await request(app).get("/api/users").query({ role: "supervisor" }).set(as(d.secretary))).status, 403);
    const listed = await request(app).get("/api/users").query({ role: "supervisor" }).set(as(d.admin));
    assert.deepEqual(listed.body.map((u) => u.email), ["sylvain@test.cm"]);
  });

  test("consultation : administration et surveillants ; un surveillant sans classe ne voit rien", async () => {
    const dashboard = (user) => request(app).get(`${api}/dashboard`).set(as(user));
    assert.equal((await dashboard(d.secretary)).status, 403);
    assert.equal((await dashboard(d.teacherB)).status, 403);
    assert.equal((await dashboard(d.parent1)).status, 403);

    const admin = await dashboard(d.admin);
    assert.equal(admin.status, 200, JSON.stringify(admin.body));
    assert.equal(admin.body.supervisedClasses, null, "l'administration voit tout l'établissement");
    assert.deepEqual(admin.body.classesWithoutSupervisor.map((c) => c.name), ["6e A", "6e B"]);
    const classA = admin.body.todayStats.byClass.find((c) => c.className === "6e A");
    assert.deepEqual([classA.absent, classA.late], [1, 0]);

    const empty = await dashboard(d.sg);
    assert.equal(empty.status, 200);
    assert.equal(empty.body.supervisedClasses, 0);
    assert.deepEqual(empty.body.todayStats.byClass, []);
  });

  test("un enseignant peut aussi être surveillant général sans cesser d'enseigner", async () => {
    const grant = (user, functions) => request(app).put(`/api/users/${user._id}`).set(as(d.admin)).send({ functions });
    assert.equal((await grant(d.teacherB, ["inconnu"])).status, 400);
    const granted = await grant(d.teacherB, ["vie_scolaire"]);
    assert.equal(granted.status, 200);
    assert.equal(granted.body.role, "teacher");
    assert.deepEqual(granted.body.functions, ["vie_scolaire"]);
    // Un parent ne peut pas recevoir de fonction
    assert.deepEqual((await grant(d.parent1, ["vie_scolaire"])).body.functions, []);

    // Bruno garde ses cours de français en 6e A
    const classes = await request(app).get("/api/teacher/me").set(as(d.teacherB));
    assert.equal(classes.status, 200);
    assert.ok(classes.body.some((a) => a.class?.name === "6e A" && a.subject?.name === "Français"));
    const evaluation = await request(app)
      .post("/api/evaluations")
      .set(as(d.teacherB))
      .send({ name: "Rédaction", classId: d.classA._id, subjectId: d.french._id, periodId: d.s1._id });
    assert.equal(evaluation.status, 201, JSON.stringify(evaluation.body));
  });

  test("l'administrateur confie des classes à chacun (un surveillant par classe)", async () => {
    assert.equal((await assign(d.sg, d.sg, [d.classA._id])).status, 403);
    assert.equal((await assign(d.admin, d.teacherA, [d.classA._id])).status, 400, "Alice n'est pas surveillante");
    const sylvain = await assign(d.admin, d.sg, [d.classA._id]);
    assert.equal(sylvain.status, 200, JSON.stringify(sylvain.body));
    assert.deepEqual(sylvain.body.classes.map((c) => c.name), ["6e A"]);
    const bruno = await assign(d.admin, d.teacherB, [d.classB._id]);
    assert.deepEqual(bruno.body.classes.map((c) => c.name), ["6e B"]);

    const supervisors = await request(app).get(`${api}/supervisors`).set(as(d.admin));
    const names = Object.fromEntries(supervisors.body.map((s) => [s.firstName, s.classes.map((c) => c.name)]));
    assert.deepEqual(names, { Bruno: ["6e B"], Sylvain: ["6e A"] });
    assert.deepEqual((await request(app).get(`${api}/dashboard`).set(as(d.admin))).body.classesWithoutSupervisor, []);
    assert.equal((await request(app).get(`${api}/dashboard`).set(as(d.sg))).body.todayStats.byClass[0].className, "6e A");
  });
});

describe("Absences, justificatifs et sanctions : le surveillant agit, l'administration consulte", () => {
  let absenceId;
  let fileId;

  test("saisie par le surveillant, justificatif du parent, examen", async () => {
    const create = (user, body) => request(app).post(`${api}/records`).set(as(user)).send(body);
    const base = { studentId: d.student1._id, day: "2025-10-06", kind: "absence", hours: 4 };
    assert.equal((await create(d.teacherA, base)).status, 403);
    const byAdmin = await create(d.admin, base);
    assert.equal(byAdmin.status, 403, "l'administration ne saisit pas les absences");
    assert.equal(byAdmin.body.code, "VIE_SCOLAIRE_READ_ONLY");
    assert.equal((await create(d.sg, { ...base, hours: 20 })).status, 400);

    const created = await create(d.sg, base);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.justified, false);
    assert.equal(created.body.source, "manual");
    assert.equal(created.body.recordedBy, "Test Sylvain");
    absenceId = created.body.id;
    assert.match((await lastNotification(d.parent1)).message, /lundi 6 octobre 2025/);

    const justify = (user, body) => request(app).post(`${api}/records/${absenceId}/justification`).set(as(user)).send(body);
    assert.equal((await justify(d.parent2, { message: "Malade" })).status, 404);
    assert.equal((await justify(d.parent1, { message: "" })).status, 400);
    assert.equal((await justify(d.parent1, { message: "Malade", file: "data:image/svg+xml;base64,PHN2Zy8+" })).status, 400);
    const adminBefore = (await notificationsOf(d.admin)).length;
    const sent = await justify(d.parent1, { message: "Rendez-vous médical", file: PNG });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    assert.equal(sent.body.justification.status, "pending");
    fileId = sent.body.justification.fileId;
    assert.ok(fileId);
    // Prévenu : le surveillant de la 6e A, qui traite la demande (ni l'administration, ni le surveillant de la 6e B)
    assert.match((await lastNotification(d.sg)).title, /^Justificatif reçu : Mballa Awa \(6e A\)/);
    assert.equal((await notificationsOf(d.admin)).length, adminBefore);
    assert.ok(!(await notificationsOf(d.teacherB)).some((n) => /^Justificatif reçu/.test(n.title)));

    const file = (user) => request(app).get(`${api}/files/${fileId}`).set(as(user));
    const own = await file(d.parent1);
    assert.equal(own.status, 200);
    assert.equal(own.headers["content-type"], "image/png");
    assert.equal(own.body.length, Buffer.from(PNG.split(",")[1], "base64").length);
    assert.equal((await file(d.parent2)).status, 404);
    assert.equal((await file(d.teacherA)).status, 403);
    assert.equal((await file(d.teacherB)).status, 404, "surveillant d'une autre classe");
    assert.equal((await file(d.sg)).status, 200);
    assert.equal((await file(d.admin)).status, 200, "consultation par l'administration");

    const pending = await request(app).get(`${api}/records`).query({ status: "pending" }).set(as(d.sg));
    assert.deepEqual(pending.body.records.map((r) => r.id), [absenceId]);

    const review = (user, body) => request(app).post(`${api}/records/${absenceId}/review`).set(as(user)).send(body);
    assert.equal((await review(d.admin, { decision: "accept" })).status, 403);
    assert.equal((await review(d.sg, { decision: "peut-être" })).status, 400);
    const accepted = await review(d.sg, { decision: "accept" });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.justified, true);
    assert.equal(accepted.body.justification.status, "accepted");
    assert.match((await lastNotification(d.parent1)).title, /^Justificatif accepté : Awa/);
    assert.equal((await review(d.sg, { decision: "accept" })).status, 409);
    assert.equal((await justify(d.parent1, { message: "Encore" })).status, 409);

    // Une absence non justifiée de 12 h et un retard, sur la séquence 1
    assert.equal((await create(d.sg, { studentId: d.student1._id, day: "2025-10-07", kind: "absence", hours: 12 })).status, 201);
    assert.equal((await create(d.sg, { studentId: d.student1._id, day: "2025-10-08", kind: "late", minutesLate: 10 })).status, 201);
  });

  test("sanctions : décidées par le surveillant, le parent est prévenu", async () => {
    const incident = (user, body) => request(app).post(`${api}/incidents`).set(as(user)).send(body);
    const base = { studentId: d.student1._id, day: "2025-10-09" };
    assert.equal((await incident(d.teacherA, { ...base, type: "retenue", hours: 2, reason: "Bavardages" })).status, 403);
    assert.equal((await incident(d.admin, { ...base, type: "retenue", hours: 2, reason: "Bavardages" })).status, 403);
    assert.equal((await incident(d.sg, { ...base, type: "exclusion", reason: "Bagarre" })).status, 400);
    assert.equal((await incident(d.sg, { ...base, type: "retenue", hours: 2, reason: "" })).status, 400);
    assert.equal((await incident(d.sg, { ...base, type: "punition", reason: "Bavardages" })).status, 400);

    const created = await incident(d.sg, { ...base, type: "retenue", hours: 2, reason: "Bavardages répétés" });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.hours, 2);
    const toParent = await lastNotification(d.parent1);
    assert.match(toParent.title, /^Retenue : Awa/);
    assert.match(toParent.message, /Motif : Bavardages répétés/);

    const list = await request(app).get(`${api}/incidents`).query({ periodId: String(d.s1._id) }).set(as(d.admin));
    assert.equal(list.body.incidents.length, 1);
    assert.equal(list.body.incidents[0].decidedBy, "Test Sylvain");
  });

  test("tableau de bord de la période et fiche élève", async () => {
    const res = await request(app).get(`${api}/dashboard`).query({ periodId: String(d.s1._id) }).set(as(d.admin));
    assert.equal(res.status, 200);
    assert.equal(res.body.range.from, "2025-09-01");
    assert.equal(res.body.range.to, "2025-10-31");
    const awa = res.body.alerts.find((a) => a.studentName === "Mballa Awa");
    assert.ok(awa, "12 h non justifiées dépassent le seuil d'alerte (6 h)");
    assert.equal(awa.unjustifiedHours, 12);
    assert.equal(awa.detentionHours, 2);
    assert.deepEqual(awa.proposals.map((p) => p.code), ["AC"]);
    assert.equal(res.body.recentIncidents.length, 1);

    const summary = (user) =>
      request(app).get(`${api}/students/${d.student1._id}/summary`).query({ periodId: String(d.s1._id) }).set(as(user));
    const own = await summary(d.parent1);
    assert.equal(own.status, 200);
    assert.deepEqual(
      [own.body.summary.justifiedHours, own.body.summary.unjustifiedHours, own.body.summary.lateCount],
      [4, 12, 1],
    );
    assert.deepEqual(own.body.proposals, [], "les propositions ne sont pas montrées aux parents");
    assert.equal((await summary(d.parent2)).status, 404);
    assert.equal((await summary(d.teacherA)).status, 200);
    assert.equal((await summary(d.teacherC)).status, 403);
    assert.equal((await summary(d.sg)).body.proposals[0].code, "AC");
    assert.equal((await summary(d.admin)).body.proposals[0].code, "AC");
  });

  test("bulletin : discipline à jour sur un brouillon, figée à la publication, décision proposée au conseil", async () => {
    const generate = () => request(app).post("/api/bulletins/generate").set(as(d.admin)).send({ classId: d.classA._id, periodId: d.s1._id });
    assert.equal((await generate()).status, 200);
    const bulletin = await Bulletin().findOne({ student: d.student1._id, period: d.s1._id }).lean();
    assert.deepEqual(bulletin.discipline, {
      justifiedHours: 4,
      unjustifiedHours: 12,
      totalHours: 16,
      lateCount: 1,
      detentionHours: 2,
      exclusionDays: 0,
      warningCount: 0,
      blameCount: 0,
    });
    // Les absences de Boris relevées aujourd'hui sont hors de la séquence 1
    const boris = await Bulletin().findOne({ student: d.student2._id, period: d.s1._id }).lean();
    assert.equal(boris.discipline.totalHours, 0);

    const staffView = await request(app).get(`/api/bulletins/${bulletin._id}`).set(as(d.admin));
    assert.equal(staffView.body.discipline.unjustifiedHours, 12);
    assert.equal(staffView.body.disciplineProposals[0].code, "AC");
    assert.match(staffView.body.disciplineProposals[0].reason, /12 h d'absences non justifiées/);

    // Absence saisie après la génération : visible sur le brouillon sans régénérer
    const absence = (day, hours) =>
      request(app).post(`${api}/records`).set(as(d.sg)).send({ studentId: d.student1._id, day, kind: "absence", hours });
    assert.equal((await absence("2025-10-20", 2)).status, 201);
    const draftView = await request(app).get(`/api/bulletins/${bulletin._id}`).set(as(d.admin));
    assert.equal(draftView.body.discipline.unjustifiedHours, 14);

    // Publication : les valeurs du moment sont figées sur le bulletin
    assert.equal((await request(app).patch(`/api/bulletins/${bulletin._id}/publish`).set(as(d.admin))).status, 200);
    assert.equal((await Bulletin().findById(bulletin._id).lean()).discipline.unjustifiedHours, 14);
    const parentView = await request(app).get(`/api/bulletins/${bulletin._id}`).set(as(d.parent1));
    assert.equal(parentView.status, 200);
    assert.equal(parentView.body.discipline.totalHours, 18);
    assert.equal(parentView.body.disciplineProposals, undefined);
    assert.equal((await absence("2025-10-21", 1)).status, 201);
    const frozen = await request(app).get(`/api/bulletins/${bulletin._id}`).set(as(d.parent1));
    assert.equal(frozen.body.discipline.totalHours, 18, "un bulletin publié ne change plus");

    // Justifier l'absence puis régénérer (après dépublication) met le bulletin à jour
    const unjustified = await Record().findOne({ student: d.student1._id, day: "2025-10-07" }).lean();
    const justify = (user) => request(app).patch(`${api}/records/${unjustified._id}`).set(as(user)).send({ justified: true, reason: "Maladie" });
    assert.equal((await justify(d.admin)).status, 403);
    const patched = await justify(d.sg);
    assert.equal(patched.status, 200);
    assert.equal(patched.body.reason, "Maladie");
    assert.equal((await generate()).status, 409);
    await request(app).patch(`/api/bulletins/${bulletin._id}/unpublish`).set(as(d.admin));
    assert.equal((await generate()).status, 200);
    const regenerated = await Bulletin().findById(bulletin._id).lean();
    assert.equal(regenerated.discipline.justifiedHours, 16);
    assert.equal(regenerated.discipline.unjustifiedHours, 3);
  });

  test("règlement intérieur : lecture par le surveillant, modification par l'administrateur", async () => {
    const read = await request(app).get(`${api}/settings`).set(as(d.sg));
    assert.equal(read.status, 200);
    assert.equal(read.body.warningUnjustifiedHours, 10);

    const put = (user, body) => request(app).put(`${api}/settings`).set(as(user)).send(body);
    assert.equal((await put(d.sg, { alertUnjustifiedHours: 2 })).status, 403);
    assert.equal((await put(d.admin, { warningUnjustifiedHours: 25 })).status, 400, "avertissement au-delà du blâme");
    assert.equal((await put(d.admin, { defaultSessionHours: 0 })).status, 400);
    assert.equal((await put(d.admin, { notifyLate: "oui" })).status, 400);
    const saved = await put(d.admin, { alertUnjustifiedHours: 2, defaultSessionHours: 2, notifyLate: false });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.alertUnjustifiedHours, 2);
    assert.equal(saved.body.notifyLate, false);

    // Retards non signalés aux parents quand le règlement le prévoit
    const before = (await notificationsOf(d.parent1)).length;
    await appel(d.teacherA, { startTime: "14:00", entries: [{ studentId: d.student1._id, status: "late" }] });
    assert.equal((await notificationsOf(d.parent1)).length, before);
    const roster = await request(app).get(`${api}/roster`).query({ classId: String(d.classA._id) }).set(as(d.teacherA));
    assert.equal(roster.body.defaultHours, 2);
  });

  test("espace parent : uniquement ses enfants, totaux et historique", async () => {
    const res = await request(app).get(`${api}/parent/overview`).set(as(d.parent1));
    assert.equal(res.status, 200);
    assert.equal(res.body.children.length, 1);
    const awa = res.body.children[0];
    assert.equal(awa.firstName, "Awa");
    assert.equal(awa.className, "6e A");
    assert.ok(awa.records.some((r) => r.day === "2025-10-06" && r.justified));
    // Aujourd'hui est hors des périodes du jeu de test : l'historique doit tout de même l'inclure
    assert.ok(awa.records.some((r) => r.day === today()), "les absences du jour figurent dans l'historique");
    const defaultList = await request(app).get(`${api}/records`).query({ studentId: String(d.student1._id) }).set(as(d.admin));
    assert.equal(defaultList.body.range.to, today());
    assert.ok(defaultList.body.records.some((r) => r.day === today()));
    assert.equal(awa.incidents.length, 1);
    assert.equal(awa.incidents[0].decidedBy, undefined);
    assert.equal(awa.totals.year.detentionHours, 2);
    assert.equal((await request(app).get(`${api}/parent/overview`).set(as(d.admin))).status, 403);
  });

  test("suppression d'une absence par le surveillant seulement", async () => {
    assert.equal((await request(app).delete(`${api}/records/${absenceId}`).set(as(d.teacherA))).status, 403);
    assert.equal((await request(app).delete(`${api}/records/${absenceId}`).set(as(d.admin))).status, 403);
    assert.equal((await request(app).delete(`${api}/records/${absenceId}`).set(as(d.sg))).status, 200);
    assert.equal((await request(app).get(`${api}/files/${fileId}`).set(as(d.sg))).status, 404, "pièce jointe supprimée");
  });
});

describe("Chaque surveillant n'agit que dans ses classes", () => {
  test("hors de ses classes : ni appel, ni liste, ni saisie, ni sanction", async () => {
    // Une absence en 6e B, saisie par son surveillant (Bruno, enseignant qui cumule la fonction)
    const other = await request(app)
      .post(`${api}/records`)
      .set(as(d.teacherB))
      .send({ studentId: d.student3._id, day: "2025-10-08", kind: "absence", hours: 3 });
    assert.equal(other.status, 201, JSON.stringify(other.body));

    const sg = as(d.sg); // surveillant de la 6e A seulement
    assert.equal((await request(app).get(`${api}/roster`).query({ classId: String(d.classB._id) }).set(sg)).status, 403);
    assert.equal((await appel(d.sg, { classId: d.classB._id, startTime: "15:00" })).status, 403);
    const classes = await request(app).get(`${api}/classes`).query({ schoolYearId: String(d.year._id) }).set(sg);
    assert.deepEqual(classes.body.map((c) => c.name), ["6e A"]);

    const s1 = String(d.s1._id);
    assert.equal((await request(app).get(`${api}/records`).query({ classId: String(d.classB._id), periodId: s1 }).set(sg)).status, 403);
    const own = await request(app).get(`${api}/records`).query({ periodId: s1 }).set(sg);
    assert.ok(own.body.records.length > 0);
    assert.ok(own.body.records.every((r) => r.className === "6e A"));
    assert.equal((await request(app).patch(`${api}/records/${other.body.id}`).set(sg).send({ justified: true })).status, 404);
    assert.equal((await request(app).delete(`${api}/records/${other.body.id}`).set(sg)).status, 404);
    const late = { studentId: d.student3._id, day: "2025-10-08", kind: "late" };
    assert.equal((await request(app).post(`${api}/records`).set(sg).send(late)).status, 404);
    const warning = { studentId: d.student3._id, day: "2025-10-08", type: "avertissement", reason: "Insolence" };
    assert.equal((await request(app).post(`${api}/incidents`).set(sg).send(warning)).status, 404);
    assert.equal((await request(app).get(`${api}/students/${d.student3._id}/summary`).set(sg)).status, 403);

    // Bruno, surveillant de la 6e B, ne saisit pas d'absence en 6e A où il n'est qu'enseignant
    assert.equal((await request(app).post(`${api}/records`).set(as(d.teacherB)).send({ ...late, studentId: d.student1._id })).status, 404);

    // L'administration consulte toutes les classes
    const all = await request(app).get(`${api}/records`).query({ periodId: s1 }).set(as(d.admin));
    assert.ok(all.body.records.some((r) => r.className === "6e B"));
    assert.ok(all.body.records.some((r) => r.className === "6e A"));
  });

  test("dans ses classes : il corrige l'appel d'un enseignant, même ancien de plus de 7 jours", async () => {
    const roster = await request(app)
      .get(`${api}/roster`)
      .query({ classId: String(d.classA._id), day: today(), startTime: "08:00" })
      .set(as(d.sg));
    assert.equal(roster.body.supervising, true);
    assert.equal(roster.body.session.takenByMe, false);
    assert.equal((await appel(d.sg, { entries: [] })).status, 200, "appel de l'enseignante corrigé");
    assert.equal((await appel(d.sg, { day: shift(today(), -20), startTime: "09:00" })).status, 200);

    // L'enseignant qui cumule : appel de sa classe surveillée, et appel comme enseignant ailleurs
    const brunoB = await request(app).get(`${api}/roster`).query({ classId: String(d.classB._id) }).set(as(d.teacherB));
    assert.equal(brunoB.body.supervising, true);
    const brunoA = await request(app).get(`${api}/roster`).query({ classId: String(d.classA._id) }).set(as(d.teacherB));
    assert.equal(brunoA.body.supervising, false);
  });

  test("désignation depuis la fiche de la classe ; fonction retirée ou compte supprimé = classes libérées", async () => {
    const putClass = (user, cls, body) => request(app).put(`/api/classes/${cls._id}`).set(as(user)).send(body);

    assert.equal((await putClass(d.admin, d.classB, { supervisor: d.teacherA._id })).status, 400, "Alice n'est pas surveillante");
    // Le secrétariat modifie la classe mais ne peut pas changer son surveillant
    assert.equal((await putClass(d.secretary, d.classB, { supervisor: null, serie: "Bilingue" })).status, 200);
    assert.equal(String((await Class().findById(d.classB._id).lean()).supervisor), String(d.teacherB._id));
    const listed = await request(app).get("/api/classes").query({ schoolYearId: String(d.year._id) }).set(as(d.admin));
    assert.equal(listed.body.find((c) => c.name === "6e B").supervisor.firstName, "Bruno");

    // Bruno n'est plus surveillant : la 6e B est libérée, il reste enseignant
    const revoked = await request(app).put(`/api/users/${d.teacherB._id}`).set(as(d.admin)).send({ functions: [] });
    assert.equal(revoked.status, 200);
    assert.equal(revoked.body.role, "teacher");
    assert.equal((await Class().findById(d.classB._id).lean()).supervisor, undefined);

    // La 6e B est confiée à Sylvain depuis la fiche de la classe
    assert.equal((await putClass(d.admin, d.classB, { supervisor: d.sg._id })).status, 200);
    const sylvain = await request(app).get(`${api}/classes`).query({ schoolYearId: String(d.year._id) }).set(as(d.sg));
    assert.deepEqual(sylvain.body.map((c) => c.name), ["6e A", "6e B"]);

    // Compte supprimé : plus aucune classe n'a de surveillant
    assert.equal((await request(app).delete(`/api/users/${d.sg._id}`).set(as(d.admin))).status, 200);
    assert.equal(await Class().countDocuments({ supervisor: { $exists: true } }), 0);
  });
});
