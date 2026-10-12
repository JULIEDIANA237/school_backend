/**
 * Données de base : année scolaire courante, cycles, trimestres et séquences, premier compte admin.
 * Idempotent : ne recrée rien de ce qui existe déjà.
 *
 *   npm run seed
 *
 * Variables : MONGO_URI (obligatoire), SEED_SCHOOL_YEAR (ex. 2026-2027), SEED_ADMIN_EMAIL.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const SchoolYear = require("../modules/schoolYear/schoolYear.model");
const Cycle = require("../modules/cycles/cycle.model");
const Period = require("../modules/periods/period.model");
const User = require("../modules/users/user.model");
const { generateTemporaryPassword, hashPassword } = require("../utils/password");

const defaultYearName = () => {
  const now = new Date();
  const start = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1; // bascule en août
  return `${start}-${start + 1}`;
};

const utc = (y, m, d) => new Date(Date.UTC(y, m - 1, d));

const periodPlan = (startYear) => {
  const y1 = startYear;
  const y2 = startYear + 1;
  return [
    { name: "Trimestre 1", start: utc(y1, 9, 1), end: utc(y1, 12, 20), sequences: [
      { name: "Séquence 1", start: utc(y1, 9, 1), end: utc(y1, 10, 31) },
      { name: "Séquence 2", start: utc(y1, 11, 1), end: utc(y1, 12, 20) },
    ] },
    { name: "Trimestre 2", start: utc(y2, 1, 5), end: utc(y2, 3, 31), sequences: [
      { name: "Séquence 3", start: utc(y2, 1, 5), end: utc(y2, 2, 15) },
      { name: "Séquence 4", start: utc(y2, 2, 16), end: utc(y2, 3, 31) },
    ] },
    { name: "Trimestre 3", start: utc(y2, 4, 1), end: utc(y2, 6, 30), sequences: [
      { name: "Séquence 5", start: utc(y2, 4, 1), end: utc(y2, 5, 15) },
      { name: "Séquence 6", start: utc(y2, 5, 16), end: utc(y2, 6, 30) },
    ] },
  ];
};

async function seed() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI n'est pas défini (fichier .env).");
  await mongoose.connect(process.env.MONGO_URI);

  const yearName = process.env.SEED_SCHOOL_YEAR || defaultYearName();
  let year = await SchoolYear.findOne({ name: yearName });
  if (!year) {
    const hasCurrent = await SchoolYear.exists({ isCurrent: true });
    year = await SchoolYear.create({ name: yearName, isCurrent: !hasCurrent, isActive: true });
    console.log(`Année scolaire ${yearName} créée${hasCurrent ? "" : " (courante)"}.`);
  }

  for (const name of ["Premier cycle", "Second cycle"]) {
    await Cycle.updateOne({ name }, { $setOnInsert: { name, isActive: true } }, { upsert: true });
  }

  if (!(await Period.exists({ year: yearName }))) {
    // La séquence et le trimestre en cours (s'il y en a) sont activés, sauf si une autre période l'est déjà
    const now = new Date();
    const isCurrent = (p) => p.start <= now && now <= p.end;
    const activate = !(await Period.exists({ isActive: true }));
    for (const trimester of periodPlan(Number(yearName.slice(0, 4)))) {
      const t = await Period.create({
        name: trimester.name,
        type: "TRIMESTRE",
        year: yearName,
        startDate: trimester.start,
        endDate: trimester.end,
        isActive: activate && isCurrent(trimester),
      });
      for (const s of trimester.sequences) {
        await Period.create({
          name: s.name,
          type: "SEQUENCE",
          year: yearName,
          startDate: s.start,
          endDate: s.end,
          parentPeriod: t._id,
          isActive: activate && isCurrent(s),
        });
      }
    }
    console.log(`Trimestres et séquences ${yearName} créés.`);
  }

  if (!(await User.exists({ role: "admin" }))) {
    const email = (process.env.SEED_ADMIN_EMAIL || "admin@eduflow.local").toLowerCase();
    const temporaryPassword = generateTemporaryPassword(12);
    await User.create({
      email,
      password: await hashPassword(temporaryPassword),
      firstName: "Administrateur",
      lastName: "EduFlow",
      role: "admin",
      mustChangePassword: true,
    });
    console.log(`Compte admin créé : ${email} / mot de passe provisoire : ${temporaryPassword}`);
    console.log("Ce mot de passe ne sera plus affiché : il devra être changé à la première connexion.");
  }

  console.log("Seed terminé.");
}

seed()
  .catch((err) => {
    console.error("Seed échoué :", err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
