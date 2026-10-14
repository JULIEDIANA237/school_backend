const mongoose = require("mongoose");
const { supervisedClassIds, supervisesClass, viewsClass } = require("../../utils/access");
const { httpError } = require("../../utils/httpError");

/** Message renvoyé à l'administrateur qui tente une saisie : il consulte, le surveillant agit. */
const ADMIN_READ_ONLY = "L'administration consulte la vie scolaire : l'appel, les absences, les justificatifs et les sanctions sont gérés par le surveillant général de la classe.";

/**
 * Classes visibles : null pour l'administrateur (toutes), sinon celles dont l'utilisateur est le
 * surveillant général.
 */
const loadScope = (user) => supervisedClassIds(user);

const inScope = (scope, classId) => scope === null || scope.includes(String(classId?._id ?? classId));

/**
 * Condition sur le champ « class » (utilisable dans find et dans aggregate) : la classe demandée si elle
 * est visible, sinon toutes les classes visibles ; undefined = aucune restriction.
 */
const classCondition = (scope, classId) => {
  if (classId) {
    if (!mongoose.isValidObjectId(classId)) throw httpError(400, "Identifiant de classe invalide.");
    if (!inScope(scope, classId)) throw httpError(403, "Cette classe n'est pas sous votre responsabilité.");
    return new mongoose.Types.ObjectId(String(classId));
  }
  return scope === null ? undefined : { $in: scope.map((id) => new mongoose.Types.ObjectId(id)) };
};

/**
 * Saisie (absence, justificatif, sanction) : réservée au surveillant général de la classe.
 * Une classe hors de ses responsabilités est traitée comme introuvable.
 */
const assertCanAct = async (user, classId, notFoundMessage) => {
  if (user?.role === "admin") throw httpError(403, ADMIN_READ_ONLY, "VIE_SCOLAIRE_READ_ONLY");
  if (!(await supervisesClass(user, classId))) throw httpError(404, notFoundMessage);
};

module.exports = { ADMIN_READ_ONLY, loadScope, inScope, classCondition, assertCanAct, supervisesClass, viewsClass };
