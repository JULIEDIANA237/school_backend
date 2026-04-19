const Student = require("./student.model");
const Grade = require("../grades/grade.model");
const Bulletin = require("../bulletins/bulletin.model");
const User = require("../users/user.model");
const SchoolYear = require("../schoolYear/schoolYear.model");
const xlsx = require("xlsx");
const bcrypt = require("bcryptjs");

// Helper for Internal Matricule Generation
const generateInternalMatricule = async () => {
  const currentYear = new Date().getFullYear();
  const basePrefix = `INT-${currentYear}-`;
  
  const lastStudent = await Student.findOne({
    matricule: { $regex: new RegExp(`^${basePrefix}`) }
  }).sort({ matricule: -1 });

  let sequenceNumber = 1;
  if (lastStudent && lastStudent.matricule) {
    const parts = lastStudent.matricule.split('-');
    if (parts.length === 3) {
      const lastSeq = parseInt(parts[2], 10);
      if (!isNaN(lastSeq)) {
        sequenceNumber = lastSeq + 1;
      }
    }
  }
  return `${basePrefix}${sequenceNumber.toString().padStart(4, '0')}`;
};

// Créer un élève
const createStudent = async (data) => {
  if (!data.matricule) {
    data.matricule = await generateInternalMatricule();
  }
  return await Student.create(data);
};

// Modifier un élève
const updateStudent = async (id, data) => {
  const student = await Student.findById(id).populate("parents");
  if (!student) throw new Error("Student not found");

  const { phone, ...rest } = data;

  // Si un téléphone est fourni et qu'on a un parent lié
  if (phone && student.parents && student.parents.length > 0) {
    const parentId = student.parents[0]._id || student.parents[0];
    await User.findByIdAndUpdate(parentId, { phone });
  }

  Object.assign(student, rest);
  return await student.save();
};

// Lister élèves d’une classe
const getStudentsByClass = async (classId) => {
  return await Student.find({ class: classId, isActive: true })
    .populate("class")
    .populate("parents", "firstName lastName phone")
    .sort({ lastName: 1 });
};

// Rattacher un parent à un élève
const addParentToStudent = async (studentId, parentId) => {
  return await Student.findByIdAndUpdate(
    studentId,
    { $addToSet: { parents: parentId } },
    { new: true }
  );
};

// Changer de classe (fin d’année)
const changeStudentClass = async (studentId, newClassId) => {
  const student = await Student.findById(studentId);
  if (!student) throw new Error("Student not found");

  student.class = newClassId;
  return await student.save();
};

// Désactiver un élève (soft delete)
const deactivateStudent = async (studentId) => {
  const hasHistory =
    (await Grade.exists({ student: studentId })) ||
    (await Bulletin.exists({ student: studentId }));

  if (hasHistory) {
    throw new Error("Student has academic history");
  }

  return await Student.findByIdAndUpdate(
    studentId,
    { isActive: false },
    { new: true }
  );
};

// Élèves visibles par un parent
const getStudentsByParent = async (parentId) => {
  return await Student.find({
    parents: parentId,
    isActive: true
  }).populate("class");
};

// Lister tous les élèves (admin)
const getAllStudents = async () => {
  return await Student.find({ isActive: true })
    .populate("class")
    .populate("parents", "firstName lastName phone")
    .sort({ lastName: 1 });
};
const parseExcelDate = (val) => {
  if (!val) return null;
  
  // If it's already a date object
  if (val instanceof Date) return val;

  // Handle Excel date serial number (e.g. 38520)
  if (typeof val === 'number') {
    return new Date((val - 25569) * 86400 * 1000);
  }

  // Handle String format DD-MM-YYYY or DD/MM/YYYY
  if (typeof val === 'string') {
    const parts = val.split(/[-/]/);
    if (parts.length === 3) {
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1; // 0-indexed
      const y = parseInt(parts[2], 10);
      // Basic check for DD-MM-YYYY
      if (y > 1000) {
        return new Date(y, m, d);
      }
      // Or YYYY-MM-DD
      const dy = parseInt(parts[0], 10);
      if (dy > 1000) {
        return new Date(dy, m, parseInt(parts[2], 10));
      }
    }
  }

  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * Import des élèves depuis Excel
 */
/**
 * Import des élèves depuis Excel
 */
const importStudentsFromExcel = async (fileBuffer, defaultClassId, schoolYearId) => {
  const Class = require("../classes/class.model");
  const workbook = xlsx.read(fileBuffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

  const result = {
    totalRows: data.length,
    studentsCreated: 0,
    parentsCreated: 0,
    errors: []
  };

  // 🔹 Déterminer l'année scolaire de travail si non fournie
  let finalYearId = schoolYearId;
  if (!finalYearId) {
    const activeYear = await SchoolYear.findOne({ isCurrent: true });
    finalYearId = activeYear ? activeYear._id : (await SchoolYear.findOne().sort({ createdAt: -1 }))?._id;
  }

  const defaultPassword = await bcrypt.hash("EduFlow@2025", 10);

  // Helper pour trouver une valeur par patterns
  const getVal = (row, patterns) => {
    const keys = Object.keys(row);
    const key = keys.find(k => {
      const normalized = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return patterns.some(p => normalized.includes(p));
    });
    return key ? row[key] : null;
  };

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    try {
      // Extraction robuste des champs
      const valNom = getVal(row, ['nom']);
      const valPrenom = getVal(row, ['prenom']);
      const valClasse = getVal(row, ['classe']);
      const valDateNais = getVal(row, ['date', 'naissance']);
      const valLieuNais = getVal(row, ['lieu', 'naissance']);
      const valRedoublant = getVal(row, ['redoublant']);
      const valMatricule = getVal(row, ['matricule']);
      const valSexe = getVal(row, ['sexe', 'genre', 'gender']);
      
      const valNomParent = getVal(row, ['nom parent', 'parent nom']);
      const valPrenomParent = getVal(row, ['prenom parent', 'parent prenom']);
      const valTelParent = getVal(row, ['telephone', 'tel', 'phone', 'portable', 'contact']);
      const valEmailParent = getVal(row, ['email']);

      // 1. Déterminer la classe
      let targetClassId = defaultClassId;
      if (valClasse) {
        const foundClass = await Class.findOne({ 
          name: new RegExp(`^${valClasse.toString().trim()}$`, 'i'), 
          schoolYearId: finalYearId 
        });
        if (foundClass) {
          targetClassId = foundClass._id;
        } else {
          throw new Error(`Classe "${valClasse}" non trouvée pour cette année scolaire.`);
        }
      }

      if (!targetClassId) {
        throw new Error("Classe non spécifiée (ni dans le fichier, ni par défaut).");
      }

      // 2. Gestion du Parent
      let parentUser = null;
      const finalPhone = valTelParent ? valTelParent.toString().trim() : "";
      const parentEmail = valEmailParent || (finalPhone ? `${finalPhone}@eduflow.local` : null);
      
      if (parentEmail || finalPhone) {
        // Find by email OR by phone
        parentUser = await User.findOne({ 
          $or: [
            { email: parentEmail || "____never_match____" },
            { phone: finalPhone || "____never_match____" }
          ]
        });
        
        if (!parentUser) {
          parentUser = await User.create({
            email: parentEmail || `${Date.now()}@eduflow.local`,
            password: defaultPassword,
            firstName: valPrenomParent || "Parent",
            lastName: valNomParent || valNom || "Inconnu",
            phone: finalPhone,
            role: "parent"
          });
          result.parentsCreated++;
        } else if (!parentUser.phone && finalPhone) {
          parentUser.phone = finalPhone;
          await parentUser.save();
        }
      }

      // 3. Gestion de l'Elève
      const dob = parseExcelDate(valDateNais);
      
      if (valDateNais && !dob) {
        result.errors.push(`Ligne ${i + 2}: Format de date invalide "${valDateNais}". Utilisez JJ-MM-AAAA.`);
      }

      const existingStudent = await Student.findOne({
        firstName: valPrenom,
        lastName: valNom,
        class: targetClassId,
        dateOfBirth: dob
      });

      if (existingStudent) {
        result.errors.push(`Ligne ${i + 2}: L'élève ${valPrenom} ${valNom} est déjà inscrit.`);
        continue;
      }

      const internalMatricule = await generateInternalMatricule();

      let genderCode = null;
      if (valSexe) {
         const strVal = valSexe.toString().trim().toUpperCase();
         if (['M', 'MASCULIN', 'MALE', 'GARÇON', 'GARCON', 'BOY'].includes(strVal)) genderCode = 'M';
         else if (['F', 'FEMININ', 'FEMALE', 'FILLE', 'GIRL'].includes(strVal)) genderCode = 'F';
      }

      const studentData = {
        firstName: valPrenom || "Inconnu",
        lastName: valNom || "Inconnu",
        matricule: internalMatricule,
        matriculeMinesec: valMatricule || null,
        statusMinesec: valMatricule ? 'VALIDE' : 'EN_ATTENTE',
        dateOfBirth: dob || new Date(new Date().getFullYear() - 10, 0, 1),
        placeOfBirth: valLieuNais || "",
        gender: genderCode,
        isRepeating: valRedoublant ? ['oui', 'yes', 'vrai', 'true', '1'].includes(valRedoublant.toString().toLowerCase().trim()) : false,
        class: targetClassId,
        parents: parentUser ? [parentUser._id] : [],
        isActive: true
      };

      await Student.create(studentData);
      result.studentsCreated++;

    } catch (err) {
      result.errors.push(`Ligne ${i + 2}: ${err.message}`);
    }
  }

  return result;
};

module.exports = {
  createStudent,
  updateStudent,
  getStudentsByClass,
  getAllStudents,
  addParentToStudent,
  changeStudentClass,
  deactivateStudent,
  getStudentsByParent,
  importStudentsFromExcel
};
