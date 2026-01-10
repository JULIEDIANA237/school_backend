import mongoose from "mongoose";
import "dotenv/config";

import seedUsers from "../modules/users/users.seed";
import seedSubjects from "../modules/subjects/subjects.seed";
import seedClasses from "../modules/classes/classes.seed";
import seedPeriods from "../modules/periods/periods.seed";
import seedTeachers from "../modules/teachers/teachers.seed";
import seedStudents from "../modules/students/students.seed";
import seedEvaluations from "../modules/evaluations/evaluations.seed";
import seedGrades from "../modules/grades/grades.seed";
import seedBulletins from "../modules/bulletins/bulletins.seed";

const runSeed = async () => {
  try {
    if (!process.env.MONGO_URI) throw new Error("MONGO_URI not defined!");
    console.log("🔗 Connecting to MongoDB Atlas...");

    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB Atlas");

    // Chaque seed retourne le nombre de documents créés pour le logging
    const usersCount = await seedUsers();
    console.log(`📌 Users seeded: ${usersCount}`);

    const subjectsCount = await seedSubjects();
    console.log(`📘 Subjects seeded: ${subjectsCount}`);

    const classesCount = await seedClasses();
    console.log(`🏫 Classes seeded: ${classesCount}`);

    const periodsCount = await seedPeriods();
    console.log(`📅 Periods seeded: ${periodsCount}`);

    const teachersCount = await seedTeachers();
    console.log(`👨‍🏫 Teachers seeded: ${teachersCount}`);

    const studentsCount = await seedStudents();
    console.log(`👩‍🎓 Students seeded: ${studentsCount}`);

    const evaluationsCount = await seedEvaluations();
    console.log(`📝 Evaluations seeded: ${evaluationsCount}`);

    const gradesCount = await seedGrades();
    console.log(`🔢 Grades seeded: ${gradesCount}`);

    const bulletinsCount = await seedBulletins();
    console.log(`📄 Bulletins seeded: ${bulletinsCount}`);

    console.log("🎉 Seeding completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Seed failed", error);
    process.exit(1);
  }
};

runSeed();
