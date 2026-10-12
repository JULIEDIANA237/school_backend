// Environnement de test : base MongoDB en mémoire, secret JWT de test, limitation de débit désactivée.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-not-for-production-0123456789abcdef";
delete process.env.MAIL_USER;
delete process.env.MAIL_PASS;
delete process.env.TWILIO_ACCOUNT_SID;

const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { MongoMemoryServer } = require("mongodb-memory-server");

const PASSWORD = "Password123!";

const startApp = async () => {
  const mongo = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongo.getUri();
  await mongoose.connect(process.env.MONGO_URI);
  const app = require("../src/app");
  return {
    app,
    stop: async () => {
      await mongoose.disconnect();
      await mongo.stop();
    },
  };
};

const tokenFor = (user) => jwt.sign({ id: String(user._id), role: user.role }, process.env.JWT_SECRET, { expiresIn: "1h" });

const utc = (y, m, d) => new Date(Date.UTC(y, m - 1, d));

/**
 * Jeu de données : 2 classes, 2 matières, 3 enseignants, 2 parents, 3 élèves,
 * 1 trimestre avec 2 séquences, 2 évaluations notées en séquence 1.
 */
const seedSchool = async () => {
  const SchoolYear = require("../src/modules/schoolYear/schoolYear.model");
  const Cycle = require("../src/modules/cycles/cycle.model");
  const Period = require("../src/modules/periods/period.model");
  const Class = require("../src/modules/classes/class.model");
  const Subject = require("../src/modules/subjects/subject.model");
  const ClassSubject = require("../src/modules/classes/classSubject.model");
  const User = require("../src/modules/users/user.model");
  const Student = require("../src/modules/students/student.model");
  const TeacherAssignment = require("../src/modules/teachers/teacherAssignment.model");
  const Evaluation = require("../src/modules/evaluations/evaluation.model");
  const Grade = require("../src/modules/grades/grade.model");

  const password = await bcrypt.hash(PASSWORD, 4);
  const mkUser = (role, firstName, extra = {}) =>
    User.create({ role, firstName, lastName: "Test", email: `${firstName.toLowerCase()}@test.cm`, password, ...extra });

  const year = await SchoolYear.create({ name: "2025-2026", isCurrent: true });
  const cycle = await Cycle.create({ name: "Premier cycle" });
  const t1 = await Period.create({ name: "Trimestre 1", type: "TRIMESTRE", year: year.name, startDate: utc(2025, 9, 1), endDate: utc(2025, 12, 20) });
  const s1 = await Period.create({ name: "Séquence 1", type: "SEQUENCE", year: year.name, startDate: utc(2025, 9, 1), endDate: utc(2025, 10, 31), parentPeriod: t1._id, isActive: true });
  const s2 = await Period.create({ name: "Séquence 2", type: "SEQUENCE", year: year.name, startDate: utc(2025, 11, 1), endDate: utc(2025, 12, 20), parentPeriod: t1._id });

  const admin = await mkUser("admin", "Admin");
  const secretary = await mkUser("secretary", "Secretaire");
  const teacherA = await mkUser("teacher", "Alice"); // maths 6e A + professeur principal de 6e A
  const teacherB = await mkUser("teacher", "Bruno"); // français 6e A
  const teacherC = await mkUser("teacher", "Carine"); // maths 6e B uniquement
  const parent1 = await mkUser("parent", "Paul", { phone: "690000001" });
  const parent2 = await mkUser("parent", "Pauline", { phone: "690000002" });

  const classA = await Class.create({ name: "6e A", level: "6e", cycleId: cycle._id, schoolYearId: year._id, principalTeacher: teacherA._id });
  const classB = await Class.create({ name: "6e B", level: "6e", cycleId: cycle._id, schoolYearId: year._id });

  const math = await Subject.create({ name: "Mathématiques", code: "MATH" });
  const french = await Subject.create({ name: "Français", code: "FR" });
  await ClassSubject.create([
    { classId: classA._id, subjectId: math._id, schoolYearId: year._id, coefficient: 4 },
    { classId: classA._id, subjectId: french._id, schoolYearId: year._id, coefficient: 2 },
    { classId: classB._id, subjectId: math._id, schoolYearId: year._id, coefficient: 4 },
  ]);
  await TeacherAssignment.create([
    { teacherId: teacherA._id, classId: classA._id, subjectId: math._id, schoolYearId: year._id },
    { teacherId: teacherB._id, classId: classA._id, subjectId: french._id, schoolYearId: year._id },
    { teacherId: teacherC._id, classId: classB._id, subjectId: math._id, schoolYearId: year._id },
  ]);

  const student1 = await Student.create({ firstName: "Awa", lastName: "Mballa", matricule: "M1", class: classA._id, parents: [parent1._id] });
  const student2 = await Student.create({ firstName: "Boris", lastName: "Ndi", matricule: "M2", class: classA._id, parents: [parent2._id] });
  const student3 = await Student.create({ firstName: "Chantal", lastName: "Owona", matricule: "M3", class: classB._id, parents: [] });

  const evalMath = await Evaluation.create({ name: "Contrôle 1", subject: math._id, class: classA._id, period: s1._id, teacher: teacherA._id, maxScore: 20, coefficient: 1 });
  const evalFrench = await Evaluation.create({ name: "Dictée", subject: french._id, class: classA._id, period: s1._id, teacher: teacherB._id, maxScore: 20, coefficient: 1 });
  await Grade.create([
    { student: student1._id, evaluation: evalMath._id, score: 14 },
    { student: student2._id, evaluation: evalMath._id, score: 10 },
    { student: student1._id, evaluation: evalFrench._id, score: 12 },
    // Boris n'a pas de note de français : la matière doit être « non classée », pas 0
  ]);

  return {
    year, t1, s1, s2, classA, classB, math, french,
    admin, secretary, teacherA, teacherB, teacherC, parent1, parent2,
    student1, student2, student3, evalMath, evalFrench,
  };
};

module.exports = { startApp, seedSchool, tokenFor, PASSWORD, utc };
