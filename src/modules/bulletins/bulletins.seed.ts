// bulletin.seed.ts
import Bulletin from "./bulletin.model";
import Student from "../students/student.model";
import ClassModel from "../classes/class.model";
import Period from "../periods/period.model";
import Subject from "../subjects/subject.model";

export default async function seedBulletins() {
  // Récupérer les premières données disponibles
  const students = await Student.find().limit(5);
  const classes = await ClassModel.find().limit(3);
  const periods = await Period.find().limit(2);
  const subjects = await Subject.find().limit(4);

  if (!students.length || !classes.length || !periods.length || !subjects.length) {
    console.log("⚠️  Données insuffisantes pour seed Bulletin");
    return;
  }

  for (const student of students) {
    for (const period of periods) {
      const existing = await Bulletin.findOne({ student: student._id, period: period._id });
      if (existing) continue;

      // Générer des moyennes fictives par matière
      const averages = subjects.map(sub => ({
        subject: sub._id,
        average: Math.floor(Math.random() * 6) + 10, // moyenne entre 10 et 15
        rank: null
      }));

      const generalAverage =
        averages.reduce((sum, a) => sum + a.average, 0) / averages.length;

      await Bulletin.create({
        student: student._id,
        class: classes[Math.floor(Math.random() * classes.length)]._id,
        period: period._id,
        averages,
        generalAverage,
        rank: null,
        teacherComment: "",
        principalComment: "",
        isPublished: false
      });
    }
  }

  console.log("📝 Bulletins seeded");
}
