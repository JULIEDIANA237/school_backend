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

  for (let i = 0; i < data.length; i++) {
    const row = data[i]; // class, subject, coefficient, year, group
    try {
      const { 
        class: className, 
        subject: subjectName, 
        coefficient, 
        year, 
        group 
      } = row;

      if (!className || !subjectName || !coefficient || !year) {
        throw new Error("Champs requis manquants (class, subject, coefficient, year)");
      }

      // 1. Trouver l'année scolaire
      const schoolYear = await SchoolYearService.findOrCreate(year);

      // 2. Trouver la classe (pour cette année)
      const classe = await Class.findOne({ name: className, schoolYearId: schoolYear._id });
      if (!classe) throw new Error(`Classe '${className}' non trouvée pour l'année ${year}`);

      // 3. Trouver la matière
      const subject = await Subject.findOne({ 
        $or: [{ name: subjectName }, { code: subjectName.toUpperCase() }] 
      });
      if (!subject) throw new Error(`Matière '${subjectName}' non trouvée`);

      // 4. Créer/Mettre à jour le coefficient
      await ClassSubject.findOneAndUpdate(
        { classId: classe._id, subjectId: subject._id, schoolYearId: schoolYear._id },
        {
          classId: classe._id,
          subjectId: subject._id,
          schoolYearId: schoolYear._id,
          coefficient: Number(coefficient),
          group: group || 1,
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
