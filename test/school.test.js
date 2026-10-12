const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { startApp, seedSchool, tokenFor } = require("./helpers");

let app;
let stop;
let d;
const as = (user) => ({ Authorization: `Bearer ${tokenFor(user)}` });
// Petite image PNG (1×1) en data URL
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

before(async () => {
  delete process.env.SCHOOL_NAME;
  delete process.env.SCHOOL_SHORT_NAME;
  ({ app, stop } = await startApp());
  d = await seedSchool();
});

after(async () => {
  await stop();
});

describe("Profil de l'établissement", () => {
  test("lecture publique, valeurs neutres tant qu'il n'est pas renseigné", async () => {
    const res = await request(app).get("/api/school");
    assert.equal(res.status, 200);
    assert.equal(res.body.isConfigured, false);
    assert.equal(res.body.name, "");
    assert.equal(res.body.defaultTemplate, "officiel");
    assert.deepEqual(res.body.templates, ["officiel", "classique", "moderne"]);
    assert.doesNotMatch(JSON.stringify(res.body), /CEDEVE/i);
  });

  test("modification réservée à l'administrateur, valeurs contrôlées", async () => {
    const put = (user, body) => request(app).put("/api/school").set(as(user)).send(body);
    assert.equal((await put(d.secretary, { name: "Lycée" })).status, 403);
    assert.equal((await put(d.admin, { name: "" })).status, 400);
    assert.equal((await put(d.admin, { name: "Lycée", primaryColor: "rouge" })).status, 400);
    assert.equal((await put(d.admin, { name: "Lycée", logo: "data:image/svg+xml;base64,PHN2Zy8+" })).status, 400);
    assert.equal((await put(d.admin, { name: "Lycée", logo: `data:image/png;base64,${"A".repeat(500 * 1024)}` })).status, 400);
    assert.equal((await put(d.admin, { name: "Lycée", defaultTemplate: "fantaisie" })).status, 400);

    const ok = await put(d.admin, {
      name: "Lycée bilingue Les Lauriers",
      shortName: "LBL",
      motto: "Travail – Réussite",
      city: "Douala",
      phone: "699 00 00 00",
      headTitle: "Le Proviseur",
      logo: PNG,
      primaryColor: "#0F766E",
      defaultTemplate: "classique",
    });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.isConfigured, true);
    assert.equal(ok.body.primaryColor, "#0f766e");
    assert.equal(ok.body.defaultTemplate, "classique");
    assert.equal((await request(app).get("/api/school")).body.name, "Lycée bilingue Les Lauriers");
  });
});

describe("Modèle de bulletin choisi à la génération", () => {
  const Bulletin = () => require("../src/modules/bulletins/bulletin.model");
  const generate = (body) => request(app).post("/api/bulletins/generate").set(as(d.admin)).send(body);

  test("le modèle choisi est enregistré, conservé au recalcul, et le modèle par défaut s'applique sinon", async () => {
    assert.equal((await generate({ classId: d.classA._id, periodId: d.s1._id, template: "inconnu" })).status, 400);

    const res = await generate({ classId: d.classA._id, periodId: d.s1._id, template: "moderne" });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const templates = async () => (await Bulletin().find({ class: d.classA._id, period: d.s1._id }).lean()).map((b) => b.template);
    assert.deepEqual(await templates(), ["moderne", "moderne"]);

    // Recalcul sans modèle : le choix précédent est conservé
    await generate({ classId: d.classA._id, periodId: d.s1._id });
    assert.deepEqual(await templates(), ["moderne", "moderne"]);

    // Nouvelle génération sans modèle : celui de l'établissement (« classique », défini plus haut)
    await generate({ classId: d.classA._id, periodId: d.t1._id });
    const tri = await Bulletin().find({ class: d.classA._id, period: d.t1._id }).lean();
    assert.ok(tri.length > 0 && tri.every((b) => b.template === "classique"));

    const view = await request(app).get(`/api/bulletins/${tri[0]._id}`).set(as(d.admin));
    assert.equal(view.body.template, "classique");
  });
});

describe("Emails aux couleurs de l'établissement", () => {
  test("nom, logo intégré, coordonnées et expéditeur repris du profil", async () => {
    const { buildSchoolEmail } = require("../src/utils/schoolEmail");
    const { getSchoolProfile } = require("../src/modules/school/school.service");
    const profile = await getSchoolProfile();
    const email = buildSchoolEmail(profile, {
      title: "Note publiée : Mathématiques",
      greeting: "Paul",
      paragraphs: ["Awa a obtenu 14/20."],
      cta: { label: "Ouvrir mon espace parent", url: "https://ecole.example/parent" },
    });
    assert.equal(email.fromName, "LBL");
    assert.match(email.html, /Lycée bilingue Les Lauriers/);
    assert.match(email.html, /#0f766e/);
    assert.match(email.html, /cid:logo@etablissement/);
    assert.equal(email.attachments[0].cid, "logo@etablissement");
    assert.match(email.text, /Douala/);
    assert.match(email.text, /Ouvrir mon espace parent : https:\/\/ecole\.example\/parent/);
    assert.doesNotMatch(email.html + email.text, /CEDEVE/i);
  });
});
