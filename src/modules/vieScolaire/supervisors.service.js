const mongoose = require("mongoose");
const ClassModel = require("../classes/class.model");
const User = require("../users/user.model");
const { httpError } = require("../../utils/httpError");
const { loadCurrentYear } = require("./days");

const idOf = (value) => String(value?._id ?? value);

const resolveYearId = async (schoolYearId) => {
  if (schoolYearId !== undefined && schoolYearId !== null && schoolYearId !== "") {
    if (!mongoose.isValidObjectId(schoolYearId)) throw httpError(400, "Année scolaire invalide.");
    return schoolYearId;
  }
  return (await loadCurrentYear()).year?._id ?? null;
};

/** Surveillants généraux (comptes dédiés et enseignants ou secrétaires qui cumulent la fonction) et leurs classes de l'année. */
const listSupervisors = async (schoolYearId) => {
  const yearId = await resolveYearId(schoolYearId);
  const users = await User.find(User.SUPERVISOR_QUERY)
    .select("firstName lastName role email")
    .sort({ lastName: 1, firstName: 1 })
    .lean();
  const classes = await ClassModel.find({ supervisor: { $in: users.map((u) => u._id) }, ...(yearId && { schoolYearId: yearId }) })
    .select("name supervisor")
    .sort({ name: 1 })
    .lean();
  return users.map((u) => ({
    id: idOf(u._id),
    firstName: u.firstName,
    lastName: u.lastName,
    role: u.role,
    email: u.email,
    classes: classes.filter((c) => idOf(c.supervisor) === idOf(u._id)).map((c) => ({ id: idOf(c._id), name: c.name })),
  }));
};

/**
 * Classes confiées à un surveillant général pour une année : remplace sa liste pour cette année.
 * Une classe n'a qu'un surveillant : l'attribuer ici la retire à son surveillant précédent.
 */
const setSupervisedClasses = async (userId, { classIds, schoolYearId } = {}) => {
  if (!mongoose.isValidObjectId(userId)) throw httpError(400, "Identifiant d'utilisateur invalide.");
  if (!Array.isArray(classIds) || classIds.length > 300 || classIds.some((id) => !mongoose.isValidObjectId(id))) {
    throw httpError(400, "classIds doit être une liste d'identifiants de classes.");
  }
  const user = await User.findById(userId).select("role functions").lean();
  if (!user) throw httpError(404, "Utilisateur introuvable.");
  const isSupervisor = User.isSupervisorUser(user);
  if (classIds.length && !isSupervisor) {
    throw httpError(400, "Ce compte n'est pas surveillant général : créez un compte « Surveillant général » ou cochez la fonction sur un enseignant.");
  }

  const yearId = await resolveYearId(schoolYearId);
  const ids = [...new Set(classIds.map(String))];
  const classes = await ClassModel.find({ _id: { $in: ids } }).select("schoolYearId").lean();
  if (classes.length !== ids.length) throw httpError(400, "Classe introuvable.");
  if (yearId && classes.some((c) => idOf(c.schoolYearId) !== idOf(yearId))) {
    throw httpError(400, "Toutes les classes doivent appartenir à la même année scolaire.");
  }

  await ClassModel.updateMany(
    { supervisor: userId, _id: { $nin: ids }, ...(yearId && { schoolYearId: yearId }) },
    { $unset: { supervisor: 1 } },
  );
  if (ids.length) await ClassModel.updateMany({ _id: { $in: ids } }, { $set: { supervisor: userId } });
  return (await listSupervisors(yearId)).find((s) => s.id === idOf(userId)) || { id: idOf(userId), classes: [] };
};

/** Retire toutes les classes d'un ancien surveillant (fonction retirée, compte supprimé). */
const releaseSupervisor = (userId) => ClassModel.updateMany({ supervisor: userId }, { $unset: { supervisor: 1 } });

module.exports = { listSupervisors, setSupervisedClasses, releaseSupervisor };
