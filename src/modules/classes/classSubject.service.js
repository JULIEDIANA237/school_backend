const ClassSubject = require("./classSubject.model");
const Class = require("./class.model");
const Subject = require("../subjects/subject.model");
const SchoolYearService = require("../schoolYear/schoolYear.service");
const xlsx = require("xlsx");

/**
 * Récupérer les coefficients d'une classe pour une année scolaire
 */
const getClassSubjects = async (classId, schoolYearId) => {
  const query = { classId };
  if (schoolYearId) query.schoolYearId = schoolYearId;
  return await ClassSubject.find(query).populate("subjectId");
};

const assignSubjectToClass = async (data) => {
  // Ensure schoolYearId is present
  if (!data.schoolYearId) throw new Error("schoolYearId est requis");
  
  return await ClassSubject.findOneAndUpdate(
    { 
      classId: data.classId, 
      subjectId: data.subjectId, 
      schoolYearId: data.schoolYearId 
    },
    data,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

/**
 * Import des coefficients (ClassSubject) avec SchoolYear
 */
const importCoefficientsFromExcel = async (fileBuffer) => {
  const workbook = xlsx.read(fileBuffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

  const result = {
    totalRows: data.length,
    created: 0,
    errors: [],
  };

  // Charger toutes les données en amont pour optimiser
  const currentYear = await SchoolYearService.getCurrent() || (await SchoolYearService.getAll())[0];
  if (!currentYear) throw new Error("Aucune année scolaire active n'a été trouvée");

  const allClasses = await Class.find({});
  const normalize = (str) => {
    if (!str) return "";
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "").toLowerCase();
  };

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    try {
      const getVal = (rowObj, ...keys) => {
        const rowKeys = Object.keys(rowObj);
        const match = rowKeys.find(rk => keys.some(k => rk.toLowerCase().trim() === k.toLowerCase().trim()));
        return match ? rowObj[match] : undefined;
      };

      const className = getVal(row, "classe", "class");
      const subjectName = getVal(row, "matiere", "matière", "subject", "nom");
      const coefficient = getVal(row, "coefficient", "coeff", "coef");
      const groupInput = getVal(row, "groupe", "group");

      if (!className || !subjectName || !coefficient) {
        throw new Error("Champs requis manquants (Classe, Matière, Coefficient)");
      }

      // 1. Trouver la classe (sans tenir compte des accents)
      const normInput = normalize(className.toString());
      const classe = allClasses.find(c => normalize(c.name) === normInput);
      if (!classe) throw new Error(`Classe '${className}' non trouvée`);

      // 2. Trouver la matière
      const subject = await Subject.findOne({ 
        $or: [
          { name: { $regex: new RegExp(`^${subjectName.toString().trim()}$`, 'i') } },
          { code: subjectName.toString().trim().toUpperCase() }
        ]
      });
      if (!subject) throw new Error(`Matière '${subjectName}' non trouvée`);

      // 3. Créer/Mettre à jour le coefficient
      await ClassSubject.findOneAndUpdate(
        { classId: classe._id, subjectId: subject._id, schoolYearId: currentYear._id },
        {
          classId: classe._id,
          subjectId: subject._id,
          schoolYearId: currentYear._id,
          coefficient: Number(coefficient),
          group: groupInput ? Number(groupInput) : 1,
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
  getClassSubjects,
  assignSubjectToClass,
  importCoefficientsFromExcel
};
