import Subject from "./subject.model.js"; // adapter le chemin si nécessaire

export default async function seedSubjects() {
  const subjects = [
    { name: "Maths", code: "MATH", coefficient: 4 },
    { name: "Physique", code: "PHY", coefficient: 3 },
    { name: "SVT", code: "SVT", coefficient: 2 },
    { name: "Français", code: "FR", coefficient: 2 }
  ];

  for (const subj of subjects) {
    const exists = await Subject.findOne({ code: subj.code });
    if (!exists) {
      await Subject.create(subj);
    }
  }

  console.log("📘 Subjects seeded");
}
