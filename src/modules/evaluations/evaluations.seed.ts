import Evaluation from "./evaluation.model";
import Subject from "../subjects/subject.model";
import ClassModel from "../classes/class.model";
import User from "../users/user.model";
import Period from "../periods/period.model";

export default async function seedEvaluations() {
  // 🔹 Récupérer les références nécessaires
  const subjects = await Subject.find({});
  const classes = await ClassModel.find({});
  const teachers = await User.find({ role: "teacher" });
  const periods = await Period.find({});

  if (!subjects.length || !classes.length || !teachers.length || !periods.length) {
    console.log("⚠️  Veuillez d'abord seed Subjects, Classes, Teachers et Periods");
    return;
  }

  // 🔹 Exemple de seed : créer un contrôle par matière pour chaque classe et période
  for (const cls of classes) {
    for (const period of periods) {
      for (const subject of subjects) {
        const teacher = teachers[Math.floor(Math.random() * teachers.length)]; // assignation aléatoire
        const exists = await Evaluation.findOne({
          name: `Contrôle ${subject.name} - ${cls.name}`,
          class: cls._id,
          period: period._id
        });
        if (exists) continue;

        await Evaluation.create({
          name: `Contrôle ${subject.name} - ${cls.name}`,
          subject: subject._id,
          class: cls._id,
          period: period._id,
          teacher: teacher._id,
          maxScore: 20,
          coefficient: 1,
          date: new Date(),
          isPublished: false
        });
      }
    }
  }

  console.log("📝 Evaluations seeded");
}
