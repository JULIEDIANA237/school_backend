import ClassModel from "./class.model";
import Subject from "../subjects/subject.model";
import User from "../users/user.model";
import Student from "../students/student.model";

export default async function seedClasses() {
  // Exemple de classes à créer
  const classesData = [
    {
      name: "6e A",
      level: "6e",
      year: "2024-2025",
      subjectNames: ["Maths", "Physique", "SVT"],
      teacherEmails: ["teacher@school.com"],
    },
    {
      name: "6e B",
      level: "6e",
      year: "2024-2025",
      subjectNames: ["Français", "Maths", "SVT"],
      teacherEmails: ["teacher@school.com"],
    },
  ];

  for (const cls of classesData) {
    // Vérifie si la classe existe déjà
    const exists = await ClassModel.findOne({ name: cls.name, year: cls.year });
    if (exists) continue;

    // Récupération des subjects
    const subjects = await Subject.find({ name: { $in: cls.subjectNames } });

    // Récupération des enseignants
    const teachers = await User.find({ email: { $in: cls.teacherEmails } });

    // Créer la classe
    await ClassModel.create({
      name: cls.name,
      level: cls.level,
      year: cls.year,
      subjects: subjects.map(s => s._id),
      teachers: teachers.map(t => t._id),
      students: [], // à remplir après la création des students
      isActive: true,
    });
  }

  console.log("🏫 Classes seeded");
}
