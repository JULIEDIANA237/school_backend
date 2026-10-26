const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { startApp, seedSchool, tokenFor } = require("./helpers");
const SchoolProfile = require("../src/modules/school/school.model");
const User = require("../src/modules/users/user.model");

describe("Pointage Géolocalisé des Enseignants (GPS + QR Dynamique)", () => {
  let app, stop, data;
  let adminToken, teacherAToken, teacherBToken, teacherCToken;

  const SCHOOL_LAT = 3.8667;
  const SCHOOL_LNG = 11.5167;
  const IN_RADIUS_LAT = 3.8668; // ~15m
  const IN_RADIUS_LNG = 11.5168;
  const OUT_OF_RANGE_LAT = 3.8900; // ~2.5 km
  const OUT_OF_RANGE_LNG = 11.5400;

  before(async () => {
    ({ app, stop } = await startApp());
    data = await seedSchool();
    adminToken = tokenFor(data.admin);
    teacherAToken = tokenFor(data.teacherA);
    teacherBToken = tokenFor(data.teacherB);
    teacherCToken = tokenFor(data.teacherC);

    // Configurer l'école avec des coordonnées GPS
    await SchoolProfile.findOneAndUpdate(
      { key: "default" },
      {
        name: "Lycée Bilingue d'Essos",
        latitude: SCHOOL_LAT,
        longitude: SCHOOL_LNG,
        radiusMeters: 200,
      },
      { upsert: true }
    );
  });

  after(async () => {
    await stop();
  });

  /* -------------------------------------------------------------
     1. Mode A : Borne Kiosk de l'établissement
     ------------------------------------------------------------- */
  let kioskToken;

  it("L'écran Kiosk de l'école récupère le QR code dynamique", async () => {
    const res = await request(app)
      .get("/api/geo-attendance/kiosk-qr")
      .set("Authorization", `Bearer ${adminToken}`);

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.kioskQrToken);
    assert.equal(res.body.ttlSeconds, 30);
    assert.equal(res.body.radiusMeters, 200);
    kioskToken = res.body.kioskQrToken;
  });

  it("Pointage ARRIVÉE Enseignant A dans le périmètre (Mode A) -> VALID", async () => {
    const res = await request(app)
      .post("/api/geo-attendance/checkin")
      .set("Authorization", `Bearer ${teacherAToken}`)
      .send({
        type: "ARRIVAL",
        mode: "KIOSK_SCAN",
        qrToken: kioskToken,
        lat: IN_RADIUS_LAT,
        lng: IN_RADIUS_LNG,
      });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.status, "VALID");
    assert.ok(res.body.distanceMeters < 200);
    assert.equal(res.body.record.type, "ARRIVAL");
  });

  it("Double pointage ARRIVÉE refusé pour la même journée (409)", async () => {
    const res = await request(app)
      .post("/api/geo-attendance/checkin")
      .set("Authorization", `Bearer ${teacherAToken}`)
      .send({
        type: "ARRIVAL",
        mode: "KIOSK_SCAN",
        qrToken: kioskToken,
        lat: IN_RADIUS_LAT,
        lng: IN_RADIUS_LNG,
      });

    assert.equal(res.status, 409);
  });

  it("Pointage ARRIVÉE Enseignant B hors périmètre -> OUT_OF_RANGE", async () => {
    const res = await request(app)
      .post("/api/geo-attendance/checkin")
      .set("Authorization", `Bearer ${teacherBToken}`)
      .send({
        type: "ARRIVAL",
        mode: "KIOSK_SCAN",
        qrToken: kioskToken,
        lat: OUT_OF_RANGE_LAT,
        lng: OUT_OF_RANGE_LNG,
      });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.status, "OUT_OF_RANGE");
    assert.ok(res.body.distanceMeters > 200);
  });

  it("Pointage DÉPART impossible sans arrivée préalable (400)", async () => {
    const res = await request(app)
      .post("/api/geo-attendance/checkin")
      .set("Authorization", `Bearer ${teacherCToken}`)
      .send({
        type: "DEPARTURE",
        mode: "KIOSK_SCAN",
        qrToken: kioskToken,
        lat: IN_RADIUS_LAT,
        lng: IN_RADIUS_LNG,
      });

    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes("arrivée"));
  });

  it("Pointage DÉPART Enseignant A après son arrivée -> VALID", async () => {
    const res = await request(app)
      .post("/api/geo-attendance/checkin")
      .set("Authorization", `Bearer ${teacherAToken}`)
      .send({
        type: "DEPARTURE",
        mode: "KIOSK_SCAN",
        qrToken: kioskToken,
        lat: IN_RADIUS_LAT,
        lng: IN_RADIUS_LNG,
      });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.status, "VALID");
    assert.equal(res.body.record.type, "DEPARTURE");
  });

  /* -------------------------------------------------------------
     2. Mode B : Badge Mobile Enseignant (Scanné à l'entrée)
     ------------------------------------------------------------- */
  it("L'enseignant C génère son badge mobile tournant", async () => {
    const res = await request(app)
      .get("/api/geo-attendance/teacher-badge-qr")
      .set("Authorization", `Bearer ${teacherCToken}`);

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.badgeQrToken);
    assert.equal(res.body.ttlSeconds, 30);

    // Le surveillant / admin scanne le badge de Teacher C
    const pointRes = await request(app)
      .post("/api/geo-attendance/checkin")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        type: "ARRIVAL",
        mode: "BADGE_SCAN",
        qrToken: res.body.badgeQrToken,
        lat: IN_RADIUS_LAT,
        lng: IN_RADIUS_LNG,
      });

    assert.equal(pointRes.status, 201, JSON.stringify(pointRes.body));
    assert.equal(pointRes.body.status, "VALID");
    assert.equal(String(pointRes.body.record.teacherId), String(data.teacherC._id));
  });

  /* -------------------------------------------------------------
     3. Registre en direct du jour & Historique
     ------------------------------------------------------------- */
  it("L'administration consulte le registre du jour", async () => {
    const res = await request(app)
      .get("/api/geo-attendance/today")
      .set("Authorization", `Bearer ${adminToken}`);

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.totalTeachers >= 3);
    assert.equal(res.body.presentCount, 3); // A, B et C ont pointé
    assert.equal(res.body.completedCount, 1); // Teacher A a fait ARRIVAL + DEPARTURE
    assert.equal(res.body.outOfRangeCount, 1); // Teacher B était hors zone
  });

  it("L'enseignant consulte son historique personnel", async () => {
    const res = await request(app)
      .get("/api/geo-attendance/mine")
      .set("Authorization", `Bearer ${teacherAToken}`);

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(Array.isArray(res.body.history));
    assert.ok(res.body.history.length >= 1);
    const today = res.body.history[0];
    assert.ok(today.arrival);
    assert.ok(today.departure);
  });
});
