const Student = require("./student.model");
const Grade = require("../grades/grade.model");
const Bulletin = require("../bulletins/bulletin.model");
const User = require("../users/user.model");
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
  const student = await Student.findById(id);
  if (!student) throw new Error("Student not found");

  Object.assign(student, data);
  return await student.save();
};

// Lister élèves d’une classe
const getStudentsByClass = async (classId) => {
  return await Student.find({ class: classId, isActive: true })
    .populate("class")
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
    .sort({ lastName: 1 });
};

// Importer des élèves en masse depuis Excel
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

  const defaultPassword = await bcrypt.hash("EduFlow@2025", 10);

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    try {
      // 1. Déterminer la classe
      let targetClassId = defaultClassId;
      if (row.Classe) {
        const foundClass = await Class.findOne({ 
          name: row.Classe, 
          schoolYearId: schoolYearId 
        });
        if (foundClass) {
          targetClassId = foundClass._id;
        } else {
          throw new Error(`Classe "${row.Classe}" non trouvée pour cette année scolaire.`);
        }
      }

      if (!targetClassId) {
        throw new Error("Classe non spécifiée (ni dans le fichier, ni par défaut).");
      }

      // 2. Gestion du Parent
      let parentUser = null;
      const parentEmail = row.EmailParent || (row.TelephoneParent ? `${row.TelephoneParent}@eduflow.local` : null);
      
      if (parentEmail) {
        parentUser = await User.findOne({ email: parentEmail });
        
        if (!parentUser) {
          parentUser = await User.create({
            email: parentEmail,
            password: defaultPassword,
            firstName: row.PrenomParent || "Parent",
            lastName: row.NomParent || row.Nom || "Inconnu",
            role: "parent"
          });
          result.parentsCreated++;
        }
      }

      // 3. Gestion de l'Elève
      // Vérifier doublon (Nom, Prénom, Date Naissance dans la même classe)
      const dob = row.DateNaissance ? new Date(row.DateNaissance) : null;
      const existingStudent = await Student.findOne({
        firstName: row.Prenom,
        lastName: row.Nom,
        class: targetClassId,
        dateOfBirth: dob
      });

      if (existingStudent) {
        result.errors.push(`Ligne ${i + 2}: L'élève ${row.Prenom} ${row.Nom} est déjà inscrit dans cette classe.`);
        continue;
      }

      const internalMatricule = await generateInternalMatricule();

      const studentData = {
        firstName: row.Prenom || "Inconnu",
        lastName: row.Nom || "Inconnu",
        matricule: internalMatricule,
        matriculeMinesec: row.Matricule || null,
        statusMinesec: row.Matricule ? 'VALIDE' : 'EN_ATTENTE',
        dateOfBirth: dob || new Date(new Date().getFullYear() - 10, 0, 1),
        placeOfBirth: row.LieuNaissance || "",
        isRepeating: row.Redoublant ? ['oui', 'yes', 'vrai', 'true', '1'].includes(row.Redoublant.toString().toLowerCase().trim()) : false,
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
