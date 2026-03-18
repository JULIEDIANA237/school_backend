const Class = require("./class.model");
const Student = require("../students/student.model");
const CycleService = require("../cycles/cycle.service");
const SchoolYearService = require("../schoolYear/schoolYear.service");
const xlsx = require("xlsx");

/**
 * Création d'une classe
 */
const createClass = async (data) => {
  if (!data.schoolYearId) throw new Error("schoolYearId est requis");
  return await Class.create(data);
};

const updateClass = async (id, data) => {
  return await Class.findByIdAndUpdate(id, data, { new: true });
};

const deleteClass = async (id) => {
  return await Class.findByIdAndDelete(id);
};

/**
 * Import des classes depuis Excel
 */
const importClassesFromExcel = async (fileBuffer) => {
  const workbook = xlsx.read(fileBuffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

  const result = {
    totalRows: data.length,
    created: 0,
    errors: [],
  };

  for (let i = 0; i < data.length; i++) {
    const row = data[i]; // name, level, cycle, year, serie
    try {
      const { name, level, cycle, year, serie } = row;
      
      // Skip empty rows
      if (!name && !level && !cycle && !year) continue;

      if (!name || !level || !year || !cycle) {
        throw new Error("Champs requis manquants (name, level, cycle, year)");
      }

      // 1. Gérer l'année scolaire
      const schoolYear = await SchoolYearService.findOrCreate(year);

      // 2. Gérer le Cycle (on normalise en "Premier cycle" ou "Second cycle")
      let cycleLabel = cycle;
      if (cycle.toString().toLowerCase().includes("premier") || cycle.toString().includes("1")) {
        cycleLabel = "Premier cycle";
      } else if (cycle.toString().toLowerCase().includes("second") || cycle.toString().includes("2")) {
        cycleLabel = "Second cycle";
      }
      const cycleObj = await CycleService.findOrCreateCycle(cycleLabel);
      
      // 3. Optionnel : Gérer le professeur principal
      let principalTeacherId = undefined;
      const principalTeacherInput = row.PrincipalTeacher || row.principalTeacher;
      
      if (principalTeacherInput) {
        const User = require("../users/user.model");
        const input = principalTeacherInput.toString().trim();
        
        // Chercher par email (insensible à la casse)
        let teacher = await User.findOne({ 
          email: { $regex: new RegExp(`^${input}$`, 'i') }, 
          role: 'teacher' 
        });
        
        if (!teacher) {
          // Recherche ultra-flexible : on sépare tous les mots et on cherche 
          // un enseignant dont le nom ET le prénom contiennent ces mots.
          const searchTerms = input.split(/\s+/).filter(t => t.length > 0);
          
          if (searchTerms.length >= 2) {
            // On tente plusieurs combinaisons ou on cherche simplement un utilisateur 
            // dont les champs firstName/lastName contiennent les termes.
            const regexTerms = searchTerms.map(term => new RegExp(term, 'i'));
            
            // Approche : au moins un terme dans firstName et au moins un terme dans lastName
            // ou vice-versa, couvrant "Nom Prenom" et "Prenom Nom"
            teacher = await User.findOne({
              $or: [
                { 
                  firstName: { $in: regexTerms }, 
                  lastName: { $in: regexTerms } 
                }
              ],
              role: 'teacher'
            });
          }
        }
        
        if (teacher) {
          principalTeacherId = teacher._id;
        } else {
          result.errors.push(`Ligne ${i + 2}: Enseignant "${input}" non trouvé. Vérifiez l'orthographe ou importez l'enseignant d'abord.`);
        }
      }

      // 4. Créer/Mettre à jour la classe
      await Class.findOneAndUpdate(
        { name, schoolYearId: schoolYear._id },
        {
          name,
          level,
          cycleId: cycleObj._id,
          schoolYearId: schoolYear._id,
          serie: serie || "",
          principalTeacher: principalTeacherId,
          isActive: true,
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

const getAllClasses = async (schoolYearId) => {
  const query = { isActive: true };
  if (schoolYearId) query.schoolYearId = schoolYearId;
  
  return await Class.find(query)
    .populate("cycleId")
    .populate("schoolYearId")
    .populate("principalTeacher", "firstName lastName");
};

const getClassDetails = async (id) => {
  return await Class.findById(id)
    .populate("cycleId")
    .populate("schoolYearId")
    .populate("principalTeacher", "firstName lastName");
};

const addStudentToClass = async (classId, studentId) => {
  return await Class.findByIdAndUpdate(
    classId,
    { $addToSet: { students: studentId } },
    { new: true }
  );
};

const addSubjectToClass = async (classId, subjectId) => {
    // This is handled by ClassSubject, but keeping for compatibility if used
    return await Class.findById(classId);
};

const addTeacherToClass = async (classId, teacherId) => {
    return await Class.findByIdAndUpdate(
        classId,
        { principalTeacher: teacherId },
        { new: true }
    );
};

const getClassStudents = async (id) => {
  const classe = await Class.findById(id).populate("students");
  return classe ? classe.students : [];
};

const getClassSubjects = async (id) => {
  // This usually comes from ClassSubject model filtering by classId
  // For compatibility with controller we look it up or return empty
  const ClassSubject = require("./classSubject.model");
  return await ClassSubject.find({ classId: id }).populate("subjectId");
};

const getClassTeachers = async (id) => {
  const TeacherAssignment = require("./teacherAssignment.model");
  const assignments = await TeacherAssignment.find({ classId: id }).populate("teacherId");
  return assignments.map(a => a.teacherId);
};

module.exports = {
  createClass,
  updateClass,
  deleteClass,
  importClassesFromExcel,
  getAllClasses,
  getClassDetails,
  addStudentToClass,
  addSubjectToClass,
  addTeacherToClass,
  getClassStudents,
  getClassSubjects,
  getClassTeachers
};
