const Subject = require("./subject.model");
const Evaluation = require("../evaluations/evaluation.model");
const xlsx = require("xlsx");

// Créer une matière
const createSubject = async (data) => {
  return await Subject.create(data);
};

// Modifier une matière
const updateSubject = async (id, data) => {
  return await Subject.findByIdAndUpdate(id, data, { new: true });
};

// Liste des matières actives
const getActiveSubjects = async () => {
  return await Subject.find({ isActive: true });
};

// Désactiver une matière (soft delete)
const disableSubject = async (id) => {
  return await Subject.findByIdAndUpdate(id, { isActive: false }, { new: true });
};

// Récupérer par code
const getSubjectByCode = async (code) => {
  return await Subject.findOne({ code: code.toUpperCase() });
};

/**
 * Import des matières depuis Excel
 */
const importSubjectsFromExcel = async (fileBuffer) => {
  const workbook = xlsx.read(fileBuffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

  const result = {
    totalRows: data.length,
    created: 0,
    errors: []
  };

  for (let i = 0; i < data.length; i++) {
    const row = data[i]; // name
    try {
      const name = row.name || row.Nom;
      if (!name) throw new Error("Nom de la matière requis");

      const code = name.substring(0, 4).toUpperCase();

      await Subject.findOneAndUpdate(
        { name },
        { name, code },
        { upsert: true, new: true }
      );
      result.created++;
    } catch (err) {
      result.errors.push(`Ligne ${i + 2}: ${err.message}`);
    }
  }

  return result;
};

module.exports = {
  createSubject,
  updateSubject,
  getActiveSubjects,
  disableSubject,
  getSubjectByCode,
  importSubjectsFromExcel
};
