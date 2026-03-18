const mongoose = require("mongoose");
const SchoolYear = require("../modules/schoolYear/schoolYear.model");
const Cycle = require("../modules/cycles/cycle.model");

const MONGO_URI = "mongodb+srv://Julie237:Module237@cluster0.e256eth.mongodb.net/school_api?appName=Cluster0";

const seed = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB for seeding...");

    // 1. School Years
    const years = [
      { name: "2023-2024", isCurrent: false },
      { name: "2024-2025", isCurrent: true },
    ];

    for (const y of years) {
      await SchoolYear.findOneAndUpdate({ name: y.name }, y, { upsert: true });
    }
    console.log("SchoolYears seeded.");

    // 2. Cycles
    const cycles = [
      { name: "Premier cycle", isActive: true },
      { name: "Second cycle", isActive: true },
    ];

    for (const c of cycles) {
      await Cycle.findOneAndUpdate({ name: c.name }, c, { upsert: true });
    }
    console.log("Cycles seeded.");

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

seed();
