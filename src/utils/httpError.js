class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    if (code) this.code = code;
  }
}

const httpError = (status, message, code) => new HttpError(status, message, code);

/**
 * Statut HTTP à renvoyer pour une erreur interceptée dans un contrôleur.
 * Les erreurs métier « simples » (new Error) gardent le statut de repli.
 */
const statusOf = (error, fallback = 400) => {
  if (error?.status) return error.status;
  if (error?.name === "CastError" || error?.name === "ValidationError") return 400;
  if (error?.code === 11000) return 409;
  return fallback;
};

const sendError = (res, error, fallback = 400) => {
  const status = statusOf(error, fallback);
  if (status >= 500) console.error(error);
  const body = {
    error:
      status >= 500 && process.env.NODE_ENV === "production"
        ? "Erreur serveur"
        : error?.code === 11000
          ? "Cette valeur existe déjà."
          : error?.message || "Erreur",
  };
  if (typeof error?.code === "string") body.code = error.code;
  return res.status(status).json(body);
};

module.exports = { HttpError, httpError, statusOf, sendError };
