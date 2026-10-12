/**
 * Écritures groupées pour les imports Excel : une seule requête pour tout le fichier au lieu
 * d'une par ligne (avec MongoDB Atlas, chaque aller-retour coûte plusieurs centaines de ms).
 * Les écritures sont non ordonnées : une ligne refusée n'empêche pas les autres d'être enregistrées.
 */

const duplicateMessage = (error) => {
  const match = /dup key: (\{.*\})/.exec(error.errmsg || error.message || "");
  return match ? `Doublon : ${match[1].replace(/"/g, "")} existe déjà.` : "Doublon : cet enregistrement existe déjà.";
};

/** Index (dans la liste envoyée) et message de chaque écriture refusée par MongoDB. */
const writeErrorsOf = (error) => {
  const raw = error?.writeErrors ?? error?.result?.getWriteErrors?.();
  const list = raw ? [].concat(raw) : [];
  if (!list.length) throw error;
  return list.map((e) => ({
    index: e.index,
    message: e.code === 11000 ? duplicateMessage(e) : e.errmsg || e.message || "Écriture refusée par la base.",
  }));
};

/** bulkWrite non ordonné ; renvoie les écritures refusées ([] si tout est passé). */
const bulkWriteSafe = async (Model, ops) => {
  if (!ops.length) return [];
  try {
    await Model.bulkWrite(ops, { ordered: false });
    return [];
  } catch (error) {
    return writeErrorsOf(error);
  }
};

/**
 * insertMany non ordonné ; renvoie les insertions refusées ([] si tout est passé).
 * Les documents doivent être validés au préalable (validateDocs) pour que les index correspondent.
 */
const insertManySafe = async (Model, docs) => {
  if (!docs.length) return [];
  try {
    await Model.insertMany(docs, { ordered: false });
    return [];
  } catch (error) {
    return writeErrorsOf(error);
  }
};

/** Validation Mongoose sans accès à la base : message d'erreur, ou null si le document est valide. */
const validationError = async (Model, doc) => {
  try {
    await new Model(doc).validate();
    return null;
  } catch (error) {
    return (
      Object.values(error.errors || {})
        .map((e) => e.message)
        .join(" ; ") || error.message
    );
  }
};

module.exports = { bulkWriteSafe, insertManySafe, validationError };
