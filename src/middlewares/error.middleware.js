const { sendError } = require("../utils/httpError");

const notFound = (req, res) => res.status(404).json({ error: "Route introuvable" });

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  if (err?.name === "MulterError") {
    const message =
      err.code === "LIMIT_FILE_SIZE" ? "Fichier trop volumineux (5 Mo maximum)." : "Fichier invalide.";
    return res.status(400).json({ error: message });
  }
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ error: "Requête trop volumineuse." });
  }
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "JSON invalide." });
  }
  if (err?.name === "CastError") {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  return sendError(res, err, 500);
};

module.exports = { notFound, errorHandler };
