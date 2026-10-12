const multer = require("multer");

const ALLOWED_EXTENSIONS = /\.(xlsx|xls|csv)$/i;

/** Upload en mémoire limité à un fichier tableur de 5 Mo. */
const spreadsheetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 10 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_EXTENSIONS.test(file.originalname || "")) return cb(null, true);
    const error = new Error("Format de fichier non pris en charge (.xlsx, .xls ou .csv attendu).");
    error.status = 400;
    return cb(error);
  },
});

module.exports = { spreadsheetUpload };
