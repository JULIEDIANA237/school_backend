const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { startApp, seedSchool, tokenFor } = require("./helpers");

let app;
let stop;
let d;
const as = (user) => ({ Authorization: `Bearer ${tokenFor(user)}` });
const Notification = () => require("../src/modules/notifications/notification.model");
const Evaluation = () => require("../src/modules/evaluations/evaluation.model");
const Period = () => require("../src/modules/periods/period.model");

before(async () => {
  ({ app, stop } = await startApp());
  d = await seedSchool();
});

after(async () => {
  await stop();
});

const notificationsFor = (user, title, since) =>
  Notification().find({ user: user._id, title, createdAt: { $gte: since } }).lean();

describe("Notifications aux parents", () => {
  test("création d'une évaluation : chaque parent de la classe est prévenu", async () => {
    const since = new Date();
    const res = await request(app)
      .post("/api/evaluations")
      .set(as(d.teacherA))
      .send({ name: "Devoir maison", classId: d.classA._id, subjectId: d.math._id, periodId: d.s1._id, date: "2025-10-06" });
    assert.ok(res.status < 300, JSON.stringify(res.body));

    const [forParent1] = await notificationsFor(d.parent1, "Nouvelle évaluation : Mathématiques", since);
    const [forParent2] = await notificationsFor(d.parent2, "Nouvelle évaluation : Mathématiques", since);
    assert.equal(forParent1.message, "Awa (6e A) : nouvelle évaluation « Devoir maison » en Mathématiques, Séquence 1, du 06/10/2025.");
    assert.match(forParent2.message, /^Boris \(6e A\)/);
  });

  test("publication : la note de l'enfant et la moyenne de classe, sans doublon, notes corrigées signalées", async () => {
    const url = `/api/evaluations/${d.evalMath._id}`;
    const since = new Date();
    assert.equal((await request(app).patch(`${url}/publish`).set(as(d.teacherA))).status, 200);

    const [note1] = await notificationsFor(d.parent1, "Note publiée : Mathématiques", since);
    const [note2] = await notificationsFor(d.parent2, "Note publiée : Mathématiques", since);
    assert.equal(note1.message, "Awa a obtenu 14/20 à « Contrôle 1 » (Mathématiques, 6e A, Séquence 1). Moyenne de la classe : 12/20.");
    assert.match(note2.message, /^Boris a obtenu 10\/20/);

    // Republication sans changement : rien de nouveau
    await request(app).patch(`${url}/unpublish`).set(as(d.teacherA));
    const second = new Date();
    await request(app).patch(`${url}/publish`).set(as(d.teacherA));
    assert.equal((await Notification().countDocuments({ createdAt: { $gte: second }, user: { $in: [d.parent1._id, d.parent2._id] } })), 0);

    // Note de Boris corrigée puis republication : seul son parent est prévenu
    await request(app).patch(`${url}/unpublish`).set(as(d.teacherA));
    const Grade = require("../src/modules/grades/grade.model");
    await Grade.updateOne({ evaluation: d.evalMath._id, student: d.student2._id }, { $set: { score: 11 } });
    const third = new Date();
    await request(app).patch(`${url}/publish`).set(as(d.teacherA));
    assert.equal((await notificationsFor(d.parent1, "Note corrigée : Mathématiques", third)).length, 0);
    const [corrected] = await notificationsFor(d.parent2, "Note corrigée : Mathématiques", third);
    assert.match(corrected.message, /^Boris a obtenu 11\/20 .* Moyenne de la classe : 12\.5\/20\.$/);
  });
});

describe("Emails aux parents", () => {
  const notificationService = require("../src/modules/notifications/notification.service");

  test("un email par parent concerné, sauf s'il a désactivé les emails ou si l'envoi est coupé", async () => {
    const User = require("../src/modules/users/user.model");
    await User.updateOne({ _id: d.parent2._id }, { $set: { "settings.notifications.email": false } });

    const original = notificationService.sendParentEmails;
    const sent = [];
    notificationService.sendParentEmails = async (jobs) => { sent.push(...jobs); };
    try {
      const create = (name) =>
        request(app)
          .post("/api/evaluations")
          .set(as(d.teacherA))
          .send({ name, classId: d.classA._id, subjectId: d.math._id, periodId: d.s1._id });

      await create("Exposé");
      assert.deepEqual(sent.map((j) => j.parent.email), [d.parent1.email]);
      assert.equal(sent[0].content.title, "Nouvelle évaluation : Mathématiques");
      assert.match(sent[0].content.message, /^Awa \(6e A\) : nouvelle évaluation « Exposé »/);

      process.env.PARENT_EMAILS = "false";
      await create("Exposé 2");
      assert.equal(sent.length, 1);
    } finally {
      delete process.env.PARENT_EMAILS;
      notificationService.sendParentEmails = original;
      await User.updateOne({ _id: d.parent2._id }, { $unset: { "settings.notifications.email": 1 } });
    }
  });
});

describe("Rappels de clôture aux enseignants", () => {
  const { runDeadlineReminders } = require("../src/modules/periods/deadlineReminder.service");
  const DAY = 24 * 60 * 60 * 1000;

  test("J-3 puis J-1 : chaque enseignant concerné est relancé une seule fois par palier", async () => {
    const now = new Date();
    // Séquence 1 se termine dans 2 jours ; les mathématiques de 6e A ne sont pas publiées, la 6e B n'a aucune évaluation
    await Period().updateOne({ _id: d.s1._id }, { $set: { endDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2)), deadlineReminders: [] } });
    await Evaluation().updateOne({ _id: d.evalMath._id }, { $set: { isPublished: false } });
    await Evaluation().deleteMany({ _id: { $ne: d.evalMath._id }, teacher: d.teacherA._id });
    await Evaluation().updateOne({ _id: d.evalFrench._id }, { $set: { isPublished: true } });

    const since = new Date();
    const first = await runDeadlineReminders(now);
    assert.deepEqual(first, [{ period: "Séquence 1", year: d.year.name, daysLeft: 2, teachers: 2 }]);

    const [forAlice] = await notificationsFor(d.teacherA, "Clôture de la Séquence 1 dans 2 jours", since);
    assert.match(forAlice.message, /6e A – Mathématiques : « Contrôle 1 » non publiée/);
    assert.equal(forAlice.type, "WARNING");
    const [forCarine] = await notificationsFor(d.teacherC, "Clôture de la Séquence 1 dans 2 jours", since);
    assert.match(forCarine.message, /6e B – Mathématiques : aucune évaluation/);
    assert.equal((await Notification().countDocuments({ user: d.teacherB._id, type: "WARNING", createdAt: { $gte: since } })), 0);

    assert.deepEqual(await runDeadlineReminders(now), []); // déjà envoyé
    assert.deepEqual([...(await Period().findById(d.s1._id).lean()).deadlineReminders].sort(), [3, 7]);

    const nextDay = await runDeadlineReminders(new Date(now.getTime() + DAY));
    assert.deepEqual(nextDay.map((r) => [r.daysLeft, r.teachers]), [[1, 2]]);
  });

  test("relance manuelle réservée à l'administration", async () => {
    const url = `/api/periods/${d.s1._id}/remind-teachers`;
    assert.equal((await request(app).post(url).set(as(d.teacherA))).status, 403);
    const res = await request(app).post(url).set(as(d.admin));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.teachers, 2);
    assert.equal((await request(app).post(`/api/periods/${d.t1._id}/remind-teachers`).set(as(d.admin))).status, 400);
  });

  test("nouvelle date de fin : les rappels repartent de zéro", async () => {
    const res = await request(app).put(`/api/periods/${d.s1._id}`).set(as(d.admin)).send({ endDate: "2025-10-30" });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual((await Period().findById(d.s1._id).lean()).deadlineReminders, []);
  });

  test("tâche planifiée protégée par CRON_SECRET", async () => {
    const url = "/api/cron/deadline-reminders";
    delete process.env.CRON_SECRET;
    assert.equal((await request(app).get(url)).status, 503);
    process.env.CRON_SECRET = "secret-de-test-0123456789";
    assert.equal((await request(app).get(url).set("Authorization", "Bearer mauvais")).status, 401);
    const ok = await request(app).get(url).set("Authorization", `Bearer ${process.env.CRON_SECRET}`);
    assert.equal(ok.status, 200);
    assert.ok(Array.isArray(ok.body.reminders));
  });
});
