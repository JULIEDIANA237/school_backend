import Student from "./student.model";
import ClassModel from "../classes/class.model"; // pour récupérer des classes existantes

export default async function seedStudents() {
  // 1️⃣ Récupérer des classes existantes (assurez-vous qu'elles soient seedées avant)
  const classes = await ClassModel.find().limit(2); // exemple, on prend les 2 premières classes

  if (!classes.length) {
    console.log("⚠️ Aucune classe trouvée. Seed des students annulé.");
    return;
  }

  const students = [
    {
      firstName: "Alice",
      lastName: "Martin",
      matricule: "STU001",
      dateOfBirth: new Date("2010-05-12"),
      class: classes[0]._id,
      photo: "",
    },
    {
      firstName: "Bob",
      lastName: "Durand",
      matricule: "STU002",
      dateOfBirth: new Date("2010-08-22"),
      class: classes[1]._id,
      photo: "",
    },
  ];

  for (const student of students) {
    const exists = await Student.findOne({ matricule: student.matricule });
    if (exists) continue;

    await Student.create(student);
  }

  console.log("👦👧 Students seeded");
}
