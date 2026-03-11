const mongoose = require("mongoose");
const Period = require("../src/modules/periods/period.model");
const PeriodService = require("../src/modules/periods/period.service");
const dotenv = require("dotenv");

dotenv.config();

async function runTest() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    const year = "2024-2025";
    
    // Cleanup
    await Period.deleteMany({ year, name: { $in: ["Test Trimestre 1", "Test Séquence 1", "Test Séquence 2"] } });

    console.log("\n--- Test 1: Create a Trimestre ---");
    const trim = await PeriodService.createPeriod({
      name: "Test Trimestre 1",
      type: "TRIMESTRE",
      year,
      startDate: "2024-09-01",
      endDate: "2024-12-20"
    });
    console.log("Trimestre created:", trim.name);

    console.log("\n--- Test 2: Create a Sequence inside the Trimestre (Should SUCCEED now) ---");
    const seq1 = await PeriodService.createPeriod({
      name: "Test Séquence 1",
      type: "SEQUENCE",
      year,
      startDate: "2024-09-01",
      endDate: "2024-10-15",
      parentPeriod: trim._id
    });
    console.log("Sequence created:", seq1.name);

    console.log("\n--- Test 3: Create overlapping Sequence (Should FAIL) ---");
    try {
      await PeriodService.createPeriod({
        name: "Test Séquence 2",
        type: "SEQUENCE",
        year,
        startDate: "2024-10-01", // Overlaps with seq1
        endDate: "2024-10-20",
        parentPeriod: trim._id
      });
      console.error("FAIL: Overlapping sequence created (should have failed)");
    } catch (error) {
      console.log("SUCCESS: Caught expected overlap error:", error.message);
    }

    console.log("\n--- Test 4: Create Sequence outside parent range (Should FAIL) ---");
    try {
      await PeriodService.createPeriod({
        name: "Test Séquence Out",
        type: "SEQUENCE",
        year,
        startDate: "2024-12-21", // After trimester end
        endDate: "2024-12-31",
        parentPeriod: trim._id
      });
      console.error("FAIL: Sequence outside parent created (should have failed)");
    } catch (error) {
      console.log("SUCCESS: Caught expected range error:", error.message);
    }

  } catch (error) {
    console.error("Unexpected error during test:", error);
  } finally {
    await mongoose.connection.close();
    process.exit();
  }
}

runTest();
