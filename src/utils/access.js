const mongoose = require("mongoose");
const { httpError } = require("./httpError");

const isStaff = (user) => user?.role === "admin" || user?.role === "secretary";

/**
 * Vie scolaire :
 * - le surveillant général (rôle dédié, ou enseignant / secrétaire qui cumule la fonction) fait l'appel,
 *   saisit les absences, traite les justificatifs et décide des sanctions de SES classes ;
 * - l'administrateur consulte tout l'établissement (et règle le règlement intérieur), sans saisir.
 */
const isSupervisor = (user) =>
  user?.role === "supervisor" ||
  ((user?.role === "teacher" || user?.role === "secretary") && (user.functions || []).includes("vie_scolaire"));

/** Consultation de la vie scolaire : administrateur et surveillants généraux. */
const canViewVieScolaire = (user) => user?.role === "admin" || isSupervisor(user);

const requireVieScolaire = (req, res, next) =>
  canViewVieScolaire(req.user) ? next() : res.status(403).json({ error: "Réservé à la vie scolaire." });

/**
 * Classes visibles en vie scolaire : celles dont l'utilisateur est le surveillant général
 * (Class.supervisor) ; null pour l'administrateur, qui voit toutes les classes.
 * @returns {Promise<string[] | null>}
 */
const supervisedClassIds = async (user) => {
  if (user?.role === "admin") return null;
  if (!isSupervisor(user)) return [];
  const Class = require("../modules/classes/class.model");
  return (await Class.distinct("_id", { supervisor: user.id })).map(String);
};

/** Vrai pour le surveillant général de cette classe : lui seul y agit (l'administrateur consulte). */
const supervisesClass = async (user, classId) => {
  if (!isSupervisor(user) || !mongoose.isValidObjectId(classId)) return false;
  const Class = require("../modules/classes/class.model");
  return !!(await Class.exists({ _id: classId, supervisor: user.id }));
};

/** Consultation d'une classe : l'administrateur, ou son surveillant général. */
const viewsClass = async (user, classId) => user?.role === "admin" || supervisesClass(user, classId);
const sameId = (a, b) => a != null && b != null && String(a?._id ?? a) === String(b?._id ?? b);

/**
 * Un enseignant a accès à une classe s'il y a une affectation active, ou s'il en
 * est le professeur principal (accès « classe » uniquement, pas « matière »).
 * La classe détermine déjà l'année scolaire : pas de filtre d'année ici.
 */
const isTeacherOfClass = async (teacherId, classId, { subjectId } = {}) => {
  if (!mongoose.isValidObjectId(classId)) return false;
  const TeacherAssignment = require("../modules/teachers/teacherAssignment.model");
  const query = { teacherId, classId, isActive: true };
  if (subjectId) query.subjectId = subjectId;
  if (await TeacherAssignment.exists(query)) return true;
  if (subjectId) return false;
  const Class = require("../modules/classes/class.model");
  return !!(await Class.exists({ _id: classId, principalTeacher: teacherId }));
};

const isPrincipalTeacher = async (teacherId, classId) => {
  if (!mongoose.isValidObjectId(classId)) return false;
  const Class = require("../modules/classes/class.model");
  return !!(await Class.exists({ _id: classId, principalTeacher: teacherId }));
};

const assertClassAccess = async (user, classId, options = {}) => {
  if (!mongoose.isValidObjectId(classId)) throw httpError(400, "Identifiant de classe invalide.");
  if (isStaff(user)) return;
  if (user?.role === "teacher" && (await isTeacherOfClass(user.id, classId, options))) return;
  throw httpError(403, "Accès interdit à cette classe.");
};

/** Charge l'élève et vérifie que l'utilisateur peut le consulter. */
const assertStudentAccess = async (user, studentId) => {
  if (!mongoose.isValidObjectId(studentId)) throw httpError(400, "Identifiant d'élève invalide.");
  const Student = require("../modules/students/student.model");
  const student = await Student.findById(studentId).select("class parents isActive").lean();
  if (!student) throw httpError(404, "Élève introuvable.");
  if (isStaff(user)) return student;
  if (user?.role === "teacher" && (await isTeacherOfClass(user.id, student.class))) return student;
  if (user?.role === "parent" && (student.parents || []).some((p) => sameId(p, user.id))) return student;
  // 404 plutôt que 403 pour ne pas confirmer l'existence de l'élève
  throw httpError(user?.role === "parent" ? 404 : 403, user?.role === "parent" ? "Élève introuvable." : "Accès interdit à cet élève.");
};

/** Middleware : vérifie l'accès à la classe désignée par req.params[param]. */
const requireClassAccess = (param = "classId", { subjectParam } = {}) => async (req, res, next) => {
  try {
    const subjectId = subjectParam ? req.params[subjectParam] : undefined;
    await assertClassAccess(req.user, req.params[param], subjectId ? { subjectId } : {});
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  isStaff,
  isSupervisor,
  canViewVieScolaire,
  requireVieScolaire,
  supervisedClassIds,
  supervisesClass,
  viewsClass,
  sameId,
  isTeacherOfClass,
  isPrincipalTeacher,
  assertClassAccess,
  assertStudentAccess,
  requireClassAccess,
};
