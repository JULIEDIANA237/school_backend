const TeacherAssignment = require("./teacherAssignment.model");
const User = require("../users/user.model");
const Class = require("../classes/class.model");
const Subject = require("../subjects/subject.model");
const SchoolYear = require("../schoolYear/schoolYear.model");
const xlsx = require("xlsx");

const TeacherAssignmentService = {
  async assign(data) {
    return await TeacherAssignment.findOneAndUpdate(
      {
        teacherId: data.teacherId,
        classId: data.classId,
        subjectId: data.subjectId,
        schoolYearId: data.schoolYearId,
      },
      data,
      { upsert: true, new: true }
    );
  },

  async getAssignments(query) {
    return await TeacherAssignment.find(query)
      .populate("teacherId", "firstName lastName")
      .populate("classId", "name")
      .populate("subjectId", "name");
  },

  async removeAssignment(id) {
    return await TeacherAssignment.findByIdAndDelete(id);
  },

  /**
   * Import des attributions depuis Excel
   * Colonnes : Classe, Matière, Professeur
   */
  async importAssignmentsFromExcel(fileBuffer) {
    const workbook = xlsx.read(fileBuffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    let currentYear = await SchoolYear.findOne({ isCurrent: true });
    if (!currentYear) {
      // Fallback si aucune année n'est explicitement marquée "current"
      currentYear = await SchoolYear.findOne().sort({ createdAt: -1 });
    }
    if (!currentYear) throw new Error("Aucune année scolaire trouvée dans le système");

    // Fix: Dropping old unused index if it exists, to fix duplication error { class: null, subject: null }
    try { await TeacherAssignment.collection.dropIndex("class_1_subject_1"); } catch(e) {}

    // Pre-récupérer toutes les classes pour ignorer les accents et les espaces
    const allClasses = await Class.find({});
    const normalize = (str) => {
      if (!str) return "";
      return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "").toLowerCase();
    };

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

        const classInput = getVal(row, "classe", "classes");
        const subjectName = getVal(row, "matiere", "matière", "name", "nom");
        const teacherInput = getVal(row, "professeur", "prof", "teacher", "enseignant");

        if (!classInput || !subjectName || !teacherInput) {
          throw new Error("Toutes les colonnes (Classe, Matière, Professeur) sont requises");
        }

        const classNames = classInput.toString().split(/[,;\|]+/).map(c => c.trim()).filter(Boolean);

        // 1. Trouver la matière
        const subjectObj = await Subject.findOne({ 
          $or: [
            { name: { $regex: new RegExp(`^${subjectName.toString().trim()}$`, 'i') } },
            { code: subjectName.toString().trim().toUpperCase() }
          ]
        });
        if (!subjectObj) throw new Error(`Matière "${subjectName}" non trouvée`);

        // 2. Trouver le professeur
        const input = teacherInput.toString().trim();
        let teacher = await User.findOne({ 
          email: { $regex: new RegExp(`^${input}$`, 'i') }, 
          role: 'teacher' 
        });

        if (!teacher) {
          const searchTerms = input.split(/\s+/).filter(t => t.length > 0);
          if (searchTerms.length >= 2) {
            const regexTerms = searchTerms.map(term => new RegExp(term, 'i'));
            teacher = await User.findOne({
              $or: [{ firstName: { $all: regexTerms } }, { lastName: { $all: regexTerms } }],
              role: 'teacher'
            });
          }
        }
        if (!teacher) throw new Error(`Professeur "${teacherInput}" non trouvé`);

        // 3. Boucler sur chaque classe pour créer les attributions
        for (const className of classNames) {
          const normTarget = normalize(className);
          const classObj = allClasses.find(c => normalize(c.name) === normTarget);
          
          if (!classObj) {
            result.errors.push(`Ligne ${i + 2}: Classe "${className}" non trouvée. Ignorée.`);
            continue;
          }

          // Créer l'attribution
          await TeacherAssignment.findOneAndUpdate(
            {
              classId: classObj._id,
              subjectId: subjectObj._id,
              schoolYearId: currentYear._id
            },
            {
              teacherId: teacher._id,
              classId: classObj._id,
              subjectId: subjectObj._id,
              schoolYearId: currentYear._id,
              isActive: true
            },
            { upsert: true, new: true }
          );

          result.created++;
        }
      } catch (err) {
        result.errors.push(`Ligne ${i + 2}: ${err.message}`);
      }
    }

    return result;
  }
};

module.exports = TeacherAssignmentService;
