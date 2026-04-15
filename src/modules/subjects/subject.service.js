const Subject = require("./subject.model");
const User = require("../users/user.model");
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
  return await Subject.find({ isActive: true }).populate("principalTeacher", "firstName lastName");
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
    const row = data[i]; 
    try {
      // Fonction helper pour ignorer la casse des en-têtes
      const getVal = (rowObj, ...keys) => {
        const rowKeys = Object.keys(rowObj);
        const match = rowKeys.find(rk => keys.some(k => rk.toLowerCase().trim() === k.toLowerCase().trim()));
        return match ? rowObj[match] : undefined;
      };

      const name = getVal(row, "nom", "name", "matiere", "matière");
      const code = getVal(row, "code") || name?.substring(0, 4).toUpperCase();
      const cycleInput = (getVal(row, "cycle") || "Tous").toString().trim();
      const catInput = (getVal(row, "categorie", "catégorie") || "Autre").toString().trim();

      // Mapping simplifié pour le cycle
      let cycle = "Tous";
      if (cycleInput.toLowerCase().includes("premier") || cycleInput.toLowerCase().startsWith("1")) {
        cycle = "Premier cycle";
      } else if (cycleInput.toLowerCase().includes("second") || cycleInput.toLowerCase().startsWith("2")) {
        cycle = "Second cycle";
      }

      // Mapping pour la catégorie
      let category = "Autre";
      if (catInput.toLowerCase().includes("litt")) {
        category = "Littéraire";
      } else if (catInput.toLowerCase().includes("scient")) {
        category = "Scientifique";
      } else if (catInput.toLowerCase().includes("compl") || catInput.toLowerCase().includes("comp")) {
        category = "Complémentaire";
      }

      if (!name) throw new Error("Nom de la matière requis");
      if (!code) throw new Error("Code de la matière requis");

      await Subject.findOneAndUpdate(
        { code: code.toUpperCase() },
        { 
          name, 
          code: code.toUpperCase(),
          cycle,
          category,
          principalTeacher: null
        },
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
