import Grade from "./grade.model";
import Student from "../students/student.model";
import Evaluation from "../evaluations/evaluation.model";

export default async function seedGrades() {
  // Récupérer tous les étudiants et évaluations existants
  const students = await Student.find();
  const evaluations = await Evaluation.find();

  if (!students.length || !evaluations.length) {
    console.log("⚠️ Aucun étudiant ou évaluation trouvé pour créer des notes");
    return;
  }

  for (const student of students) {
    for (const evaluation of evaluations) {
      // Vérifier si une note existe déjà pour cet étudiant / évaluation
      const exists = await Grade.findOne({
        student: student._id,
        evaluation: evaluation._id,
      });
      if (exists) continue;

      // Générer une note aléatoire entre 5 et 20
      const score = Math.floor(Math.random() * 16) + 5;

      await Grade.create({
        student: student._id,
        evaluation: evaluation._id,
        score,
      });
    }
  }

  console.log("📝 Grades seeded");
}
