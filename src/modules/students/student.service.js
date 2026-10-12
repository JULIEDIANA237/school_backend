const mongoose = require("mongoose");
const Student = require("./student.model");
const User = require("../users/user.model");
const Class = require("../classes/class.model");
const SchoolYear = require("../schoolYear/schoolYear.model");
const {
  readFirstSheet,
  createColumnResolver,
  assertRequiredColumns,
  parseExcelDate,
} = require("../../utils/excel");
const { compactKey, exactInsensitive } = require("../../utils/text");
const { generateTemporaryPassword, hashTemporaryPassword, normalizePhone } = require("../../utils/password");
const { httpError } = require("../../utils/httpError");
const { bulkWriteSafe, insertManySafe, validationError } = require("../../utils/bulk");

const STUDENT_FIELDS = [
  "firstName",
  "lastName",
  "matricule",
  "matriculeMinesec",
  "statusMinesec",
  "dateOfBirth",
  "placeOfBirth",
  "gender",
  "isRepeating",
  "class",
  "photo",
];

const pickFields = (data = {}) => {
  const out = Object.fromEntries(STUDENT_FIELDS.filter((k) => data[k] !== undefined).map((k) => [k, data[k]]));
  for (const key of ["matriculeMinesec", "gender", "dateOfBirth", "placeOfBirth"]) {
    if (out[key] === "") out[key] = key === "matriculeMinesec" || key === "gender" ? null : undefined;
  }
  if (out.dateOfBirth === undefined) delete out.dateOfBirth;
  return out;
};

const assertObjectId = (value, label) => {
  if (!mongoose.isValidObjectId(value)) throw httpError(400, `${label} invalide.`);
};

const assertActiveClass = async (classId) => {
  assertObjectId(classId, "Classe");
  const classDoc = await Class.findOne({ _id: classId, isActive: true }).lean();
  if (!classDoc) throw httpError(400, "Classe introuvable ou inactive.");
  return classDoc;
};

// Helper for Internal Matricule Generation
const generateInternalMatricule = async () => {
  const currentYear = new Date().getFullYear();
  const basePrefix = `INT-${currentYear}-`;

  const lastStudent = await Student.findOne({
    matricule: { $regex: new RegExp(`^${basePrefix}`) },
  }).sort({ matricule: -1 });

  let sequenceNumber = 1;
  if (lastStudent && lastStudent.matricule) {
    const lastSeq = parseInt(lastStudent.matricule.split("-")[2], 10);
    if (!isNaN(lastSeq)) sequenceNumber = lastSeq + 1;
  }
  return `${basePrefix}${sequenceNumber.toString().padStart(4, "0")}`;
};

/**
 * Retrouve le compte parent par email ou téléphone, ou le crée avec un mot de passe
 * provisoire unique (à changer à la première connexion).
 */
const findOrCreateParent = async ({ phone, email, firstName, lastName }) => {
  const normalizedPhone = normalizePhone(phone);
  const normalizedEmail = email ? String(email).trim().toLowerCase() : "";
  if (!normalizedPhone && !normalizedEmail) return { parent: null };

  const conditions = [];
  if (normalizedEmail) conditions.push({ email: exactInsensitive(normalizedEmail) });
  if (normalizedPhone) conditions.push({ phone: normalizedPhone });
  const existing = await User.findOne({ $or: conditions });
  if (existing) {
    if (existing.role !== "parent") {
      throw httpError(400, "Ce téléphone ou cet email appartient déjà à un compte qui n'est pas un parent.");
    }
    if (!existing.phone && normalizedPhone) {
      existing.phone = normalizedPhone;
      await existing.save();
    }
    return { parent: existing, created: false };
  }

  const temporaryPassword = generateTemporaryPassword();
  const parent = await User.create({
    email: normalizedEmail || `${normalizedPhone}@eduflow.local`,
    password: await hashTemporaryPassword(temporaryPassword),
    firstName: firstName ? String(firstName) : "Parent",
    lastName: lastName ? String(lastName) : "Inconnu",
    phone: normalizedPhone || undefined,
    role: "parent",
    mustChangePassword: true,
  });
  return { parent, created: true, temporaryPassword };
};

const parentCredential = (parent, temporaryPassword, studentName) => ({
  name: `${parent.lastName} ${parent.firstName}`,
  role: "parent",
  login: parent.phone || parent.email,
  temporaryPassword,
  student: studentName,
});

/** Création d'un élève ; un téléphone fourni rattache (ou crée) le compte parent. */
const createStudent = async (data) => {
  const fields = pickFields(data);
  await assertActiveClass(fields.class);
  if (!fields.matricule) fields.matricule = await generateInternalMatricule();

  let parentCredentials;
  if (data.phone || data.parentEmail) {
    const { parent, created, temporaryPassword } = await findOrCreateParent({
      phone: data.phone,
      email: data.parentEmail,
      lastName: fields.lastName,
    });
    if (parent) {
      fields.parents = [parent._id];
      if (created) parentCredentials = parentCredential(parent, temporaryPassword, `${fields.lastName} ${fields.firstName}`);
    }
  }

  const student = await Student.create(fields);
  return { ...student.toObject(), parentCredentials };
};

const updateStudent = async (id, data) => {
  assertObjectId(id, "Identifiant d'élève");
  const student = await Student.findById(id);
  if (!student) throw httpError(404, "Élève introuvable.");

  const fields = pickFields(data);
  if (fields.class && String(fields.class) !== String(student.class)) await assertActiveClass(fields.class);

  let parentCredentials;
  const phone = normalizePhone(data.phone);
  if (phone) {
    if (student.parents?.length) {
      await User.updateOne({ _id: student.parents[0], role: "parent" }, { phone });
    } else {
      const { parent, created, temporaryPassword } = await findOrCreateParent({
        phone,
        lastName: fields.lastName || student.lastName,
      });
      student.parents = [parent._id];
      if (created) parentCredentials = parentCredential(parent, temporaryPassword, `${student.lastName} ${student.firstName}`);
    }
  }

  Object.assign(student, fields);
  await student.save();
  return { ...student.toObject(), parentCredentials };
};

const getStudentsByClass = async (classId) =>
  Student.find({ class: classId, isActive: true })
    .populate("class")
    .populate("parents", "firstName lastName phone")
    .sort({ lastName: 1, firstName: 1 });

const addParentToStudent = async (studentId, parentId) => {
  assertObjectId(studentId, "Identifiant d'élève");
  assertObjectId(parentId, "Identifiant de parent");
  if (!(await User.exists({ _id: parentId, role: "parent" }))) {
    throw httpError(400, "Le compte indiqué n'est pas un compte parent.");
  }
  const student = await Student.findByIdAndUpdate(studentId, { $addToSet: { parents: parentId } }, { returnDocument: "after" });
  if (!student) throw httpError(404, "Élève introuvable.");
  return student;
};

const changeStudentClass = async (studentId, newClassId) => {
  assertObjectId(studentId, "Identifiant d'élève");
  await assertActiveClass(newClassId);
  const student = await Student.findById(studentId);
  if (!student) throw httpError(404, "Élève introuvable.");
  student.class = newClassId;
  return student.save();
};

/** Désactivation (suppression douce) : l'historique de notes et de bulletins est conservé. */
const deactivateStudent = async (studentId) => {
  assertObjectId(studentId, "Identifiant d'élève");
  const student = await Student.findByIdAndUpdate(studentId, { isActive: false }, { returnDocument: "after" });
  if (!student) throw httpError(404, "Élève introuvable.");
  return student;
};

const getStudentsByParent = async (parentId) =>
  Student.find({ parents: parentId, isActive: true }).populate("class");

const getAllStudents = async (schoolYearId) => {
  const query = { isActive: true };
  if (schoolYearId) {
    assertObjectId(schoolYearId, "Année scolaire");
    query.class = { $in: await Class.distinct("_id", { schoolYearId }) };
  }
  return Student.find(query)
    .populate("class")
    .populate("parents", "firstName lastName phone")
    .sort({ lastName: 1, firstName: 1 });
};

// Les colonnes du parent sont résolues en premier : « Nom parent » ne peut plus être pris pour « Nom ».
const STUDENT_COLUMNS = {
  parentLastName: ["nom parent", "nom du parent", "parent nom", "nom tuteur", "nom du tuteur"],
  parentFirstName: ["prenom parent", "prenom du parent", "parent prenom", "prenom tuteur", "prenom du tuteur"],
  parentPhone: [
    "telephone parent",
    "tel parent",
    "telephone du parent",
    "contact parent",
    "telephone",
    "tel",
    "phone",
    "portable",
    "contact",
    "numero",
  ],
  parentEmail: ["email parent", "email du parent", "email", "e mail", "mail"],
  lastName: ["nom", "noms", "nom eleve", "nom de l eleve", "last name", "lastname"],
  firstName: ["prenom", "prenoms", "prenom eleve", "prenom de l eleve", "first name", "firstname"],
  className: ["classe", "class"],
  dateOfBirth: ["date de naissance", "date naissance", "ne le", "nee le", "ne e le", "date of birth", "dob"],
  placeOfBirth: ["lieu de naissance", "lieu naissance", "lieu", "ne a", "nee a", "ne e a", "place of birth"],
  repeating: ["redoublant", "redouble", "repeater"],
  matriculeMinesec: ["matricule", "matricule minesec", "numero matricule"],
  gender: ["sexe", "genre", "gender"],
};

const GENDERS = {
  M: ["M", "MASCULIN", "MALE", "GARÇON", "GARCON", "BOY", "H", "HOMME"],
  F: ["F", "FEMININ", "FÉMININ", "FEMALE", "FILLE", "GIRL", "FEMME"],
};

const parseGender = (value) => {
  if (!value) return null;
  const upper = String(value).trim().toUpperCase();
  return Object.keys(GENDERS).find((g) => GENDERS[g].includes(upper)) || null;
};

/**
 * Import des élèves (et des comptes parents) depuis Excel.
 * Les comptes parents créés reçoivent un mot de passe provisoire unique, renvoyé dans `credentials`.
 */
const importStudentsFromExcel = async (fileBuffer, defaultClassId, schoolYearId) => {
  const rows = readFirstSheet(fileBuffer);
  const columns = createColumnResolver(rows, STUDENT_COLUMNS);
  assertRequiredColumns(columns, ["lastName", "firstName"], { lastName: "Nom", firstName: "Prénom" });
  if (!columns.columns.className && !defaultClassId) {
    throw httpError(400, "Indiquez une colonne « Classe » ou choisissez une classe avant l'import.");
  }

  let year = null;
  if (schoolYearId && mongoose.isValidObjectId(schoolYearId)) year = await SchoolYear.findById(schoolYearId);
  if (!year) year = (await SchoolYear.findOne({ isCurrent: true })) || (await SchoolYear.findOne().sort({ name: -1 }));
  const yearClasses = year ? await Class.find({ schoolYearId: year._id, isActive: true }).lean() : [];
  const defaultClass = defaultClassId ? await assertActiveClass(defaultClassId) : null;

  const result = {
    totalRows: rows.length,
    studentsCreated: 0,
    parentsCreated: 0,
    errors: [],
    warnings: [],
    credentials: [],
  };

  // 1. Lecture et validation des lignes, sans accès à la base
  const candidates = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const line = `Ligne ${i + 2}`;
    try {
      const lastName = columns.get(row, "lastName");
      const firstName = columns.get(row, "firstName");
      const className = columns.get(row, "className");
      if (!lastName && !firstName && !className) continue;
      if (!lastName || !firstName) throw new Error("Nom et prénom de l'élève requis");

      // Classe (de l'année scolaire visée)
      let targetClass = defaultClass;
      if (className) {
        targetClass = yearClasses.find((c) => compactKey(c.name) === compactKey(className));
        if (!targetClass) throw new Error(`Classe « ${className} » non trouvée pour ${year ? year.name : "cette année scolaire"}.`);
      }

      // Date de naissance : jamais inventée
      const rawDob = columns.get(row, "dateOfBirth");
      const dateOfBirth = parseExcelDate(rawDob);
      if (rawDob && !dateOfBirth) result.warnings.push(`${line}: date de naissance « ${rawDob} » illisible (JJ/MM/AAAA attendu), laissée vide.`);
      if (!rawDob) result.warnings.push(`${line}: date de naissance manquante pour ${lastName} ${firstName}.`);

      const parentEmail = columns.get(row, "parentEmail");
      const parentFirstName = columns.get(row, "parentFirstName");
      const parentLastName = columns.get(row, "parentLastName") || lastName;
      const matriculeMinesec = columns.get(row, "matriculeMinesec");
      const repeating = columns.get(row, "repeating");
      candidates.push({
        line,
        firstName: String(firstName),
        lastName: String(lastName),
        targetClass,
        dateOfBirth,
        parent: {
          phone: normalizePhone(columns.get(row, "parentPhone")),
          email: parentEmail ? String(parentEmail).trim().toLowerCase() : "",
          firstName: parentFirstName ? String(parentFirstName) : "Parent",
          lastName: parentLastName ? String(parentLastName) : "Inconnu",
        },
        fields: {
          matriculeMinesec: matriculeMinesec ? String(matriculeMinesec) : null,
          statusMinesec: matriculeMinesec ? "VALIDE" : "EN_ATTENTE",
          placeOfBirth: columns.get(row, "placeOfBirth") ? String(columns.get(row, "placeOfBirth")) : "",
          gender: parseGender(columns.get(row, "gender")),
          isRepeating: repeating
            ? ["oui", "yes", "vrai", "true", "1", "o", "x"].includes(String(repeating).toLowerCase().trim())
            : false,
        },
      });
    } catch (err) {
      result.errors.push(`${line}: ${err.message}`);
    }
  }

  // 2. Données existantes chargées en une fois : élèves des classes visées, comptes des parents, dernier matricule
  const classIds = [...new Set(candidates.map((c) => String(c.targetClass._id)))];
  const phones = [...new Set(candidates.map((c) => c.parent.phone).filter(Boolean))];
  const emails = [...new Set(candidates.map((c) => c.parent.email).filter(Boolean))];
  const userConditions = [
    ...(phones.length ? [{ phone: { $in: phones } }] : []),
    ...(emails.length ? [{ email: { $in: emails } }] : []),
  ];
  const matriculePrefix = `INT-${new Date().getFullYear()}-`;
  const [existingStudents, existingUsers, lastStudent] = await Promise.all([
    classIds.length ? Student.find({ class: { $in: classIds } }, { firstName: 1, lastName: 1, class: 1, dateOfBirth: 1 }).lean() : [],
    userConditions.length ? User.find({ $or: userConditions }).lean() : [],
    Student.findOne({ matricule: { $regex: new RegExp(`^${matriculePrefix}`) } }).sort({ matricule: -1 }).lean(),
  ]);

  // Élève déjà inscrit : mêmes nom et prénom (sans tenir compte de la casse) dans la même classe,
  // et même date de naissance si le fichier en donne une
  const studentKey = (first, last, classId) => `${String(first).trim().toLowerCase()}|${String(last).trim().toLowerCase()}|${classId}`;
  const knownStudents = new Map();
  const rememberStudent = (key, dob) => {
    if (!knownStudents.has(key)) knownStudents.set(key, []);
    knownStudents.get(key).push(dob ? new Date(dob).getTime() : null);
  };
  existingStudents.forEach((s) => rememberStudent(studentKey(s.firstName, s.lastName, s.class), s.dateOfBirth));
  const isKnownStudent = (key, dob) => knownStudents.has(key) && (!dob || knownStudents.get(key).includes(dob.getTime()));

  const usersByPhone = new Map();
  const usersByEmail = new Map();
  const indexUser = (u) => {
    if (u.phone) usersByPhone.set(u.phone, u);
    if (u.email) usersByEmail.set(u.email, u);
  };
  existingUsers.forEach(indexUser);

  const lastSeq = lastStudent ? parseInt(String(lastStudent.matricule).split("-")[2], 10) : 0;
  let matriculeSeq = Number.isNaN(lastSeq) ? 0 : lastSeq;

  const newParents = []; // { doc, temporaryPassword, studentName }
  const phoneUpdates = new Map(); // id du parent -> opération
  const newStudents = []; // { line, doc }

  for (const c of candidates) {
    const key = studentKey(c.firstName, c.lastName, c.targetClass._id);
    if (isKnownStudent(key, c.dateOfBirth)) {
      result.errors.push(`${c.line}: L'élève ${c.firstName} ${c.lastName} est déjà inscrit.`);
      continue;
    }

    const doc = {
      _id: new mongoose.Types.ObjectId(),
      firstName: c.firstName,
      lastName: c.lastName,
      matricule: `${matriculePrefix}${String(matriculeSeq + 1).padStart(4, "0")}`,
      ...c.fields,
      dateOfBirth: c.dateOfBirth || undefined,
      class: c.targetClass._id,
      parents: [],
      isActive: true,
    };
    const invalid = await validationError(Student, doc);
    if (invalid) {
      result.errors.push(`${c.line}: ${invalid}`);
      continue;
    }

    // Parent : compte existant (ou créé plus haut dans ce fichier pour un frère ou une sœur), sinon nouveau compte
    const { phone, email } = c.parent;
    if (phone || email) {
      const existing = (email && usersByEmail.get(email)) || (phone && usersByPhone.get(phone));
      if (existing) {
        if (existing.role !== "parent") {
          result.errors.push(`${c.line}: Ce téléphone ou cet email appartient déjà à un compte qui n'est pas un parent.`);
          continue;
        }
        if (!existing.phone && phone) {
          phoneUpdates.set(String(existing._id), { updateOne: { filter: { _id: existing._id }, update: { $set: { phone } } } });
          existing.phone = phone;
          indexUser(existing);
        }
        doc.parents = [existing._id];
      } else {
        const temporaryPassword = generateTemporaryPassword();
        const parentDoc = {
          _id: new mongoose.Types.ObjectId(),
          email: email || `${phone}@eduflow.local`,
          password: temporaryPassword, // remplacé par son empreinte avant l'enregistrement
          firstName: c.parent.firstName,
          lastName: c.parent.lastName,
          phone: phone || undefined,
          role: "parent",
          mustChangePassword: true,
        };
        newParents.push({ doc: parentDoc, temporaryPassword, studentName: `${c.lastName} ${c.firstName}` });
        indexUser(parentDoc);
        doc.parents = [parentDoc._id];
      }
    }

    matriculeSeq += 1;
    rememberStudent(key, c.dateOfBirth);
    newStudents.push({ line: c.line, doc });
  }

  // 3. Écritures groupées : parents d'abord, puis élèves
  for (const p of newParents) p.doc.password = await hashTemporaryPassword(p.temporaryPassword);
  const [failedParents, failedPhoneUpdates] = await Promise.all([
    insertManySafe(User, newParents.map((p) => p.doc)),
    bulkWriteSafe(User, [...phoneUpdates.values()]),
  ]);
  if (failedPhoneUpdates.length) {
    result.warnings.push(`${failedPhoneUpdates.length} téléphone(s) de parent existant n'ont pas pu être enregistrés.`);
  }
  const parentFailures = new Map(failedParents.map((f) => [String(newParents[f.index].doc._id), f.message]));
  newParents.forEach((p) => {
    if (parentFailures.has(String(p.doc._id))) return;
    result.parentsCreated++;
    result.credentials.push(parentCredential(p.doc, p.temporaryPassword, p.studentName));
  });

  const toInsert = newStudents.filter((s) => {
    const failure = s.doc.parents.length && parentFailures.get(String(s.doc.parents[0]));
    if (failure) result.errors.push(`${s.line}: compte parent non créé (${failure}).`);
    return !failure;
  });
  const failedStudents = await insertManySafe(Student, toInsert.map((s) => s.doc));
  failedStudents.forEach((f) => result.errors.push(`${toInsert[f.index].line}: ${f.message}`));
  result.studentsCreated = toInsert.length - failedStudents.length;

  const lineNumber = (message) => Number(/^Ligne (\d+)/.exec(message)?.[1] ?? 0);
  result.errors.sort((a, b) => lineNumber(a) - lineNumber(b));
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
  importStudentsFromExcel,
  findOrCreateParent,
};
