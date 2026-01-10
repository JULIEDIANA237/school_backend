import TeacherAssignment from "./teacherClassSubject.model";
import User from "../users/user.model";
import ClassModel from "../classes/class.model";
import Subject from "../subjects/subject.model";

export default async function seedTeacherAssignments() {
  // Récupérer un prof, une classe et des matières existantes
  const teacher = await User.findOne({ role: "teacher" });
  const classObj = await ClassModel.findOne(); // prend la première classe
  const subjects = await Subject.find(); // toutes les matières

  if (!teacher || !classObj || subjects.length === 0) {
    console.log("⚠️  Impossible de seed TeacherAssignments : données manquantes");
    return;
  }

  for (const subject of subjects) {
    const exists = await TeacherAssignment.findOne({
      teacher: teacher._id,
      class: classObj._id,
      subject: subject._id,
    });

    if (!exists) {
      await TeacherAssignment.create({
        teacher: teacher._id,
        class: classObj._id,
        subject: subject._id,
      });
    }
  }

  console.log("👨‍🏫 TeacherAssignments seeded");
}
