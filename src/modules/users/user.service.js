const bcrypt = require("bcryptjs");
const UserModel = require("./user.model");
const { escapeRegex, normalizeText } = require("../../utils/text");
const { httpError } = require("../../utils/httpError");
const {
  assertValidPassword,
  hashPassword,
  hashTemporaryPassword,
  passwordChangeTimestamp,
  generateTemporaryPassword,
  normalizePhone,
  MIN_PASSWORD_LENGTH,
} = require("../../utils/password");
const { readFirstSheet, createColumnResolver, assertRequiredColumns } = require("../../utils/excel");
const { bulkWriteSafe, insertManySafe, validationError } = require("../../utils/bulk");

const emailExists = (email) =>
  UserModel.exists({ email: { $regex: `^${escapeRegex(email)}$`, $options: "i" } });

const createUser = async (data) => {
  if (await emailExists(data.email)) throw httpError(409, "Un utilisateur existe déjà avec cet email.");
  return new UserModel(data).save();
};

const findUserByEmail = async (email) => UserModel.findOne({ email: String(email).trim().toLowerCase() });

const updateUser = async (userId, data) => {
  const user = await UserModel.findByIdAndUpdate(userId, { $set: data }, { returnDocument: "after", runValidators: true });
  if (!user) throw httpError(404, "Utilisateur introuvable.");
  return user.toSafeObject();
};

const changePassword = async (userId, oldPassword, newPassword) => {
  const user = await UserModel.findById(userId);
  if (!user) throw httpError(404, "Utilisateur introuvable.");

  if (!(await bcrypt.compare(String(oldPassword), user.password))) {
    throw httpError(400, "Mot de passe actuel incorrect");
  }
  assertValidPassword(newPassword);
  if (oldPassword === newPassword) {
    throw httpError(400, "Le nouveau mot de passe doit être différent de l'actuel.");
  }

  user.password = await hashPassword(newPassword);
  user.passwordChangedAt = passwordChangeTimestamp();
  user.mustChangePassword = false;
  await user.save();
  return user;
};

/**
 * Retrouve un enseignant à partir d'un email ou d'un nom complet (« Prénom Nom » ou « Nom Prénom »),
 * sans tenir compte de la casse ni des accents. Un nom porté par plusieurs enseignants est signalé ambigu.
 */
const buildTeacherMatcher = (teachers) => {
  const byEmail = new Map();
  const byName = new Map();
  for (const t of teachers) {
    if (t.email) byEmail.set(String(t.email).toLowerCase(), t);
    const keys = new Set([
      normalizeText(`${t.firstName} ${t.lastName}`),
      normalizeText(`${t.lastName} ${t.firstName}`),
    ]);
    for (const key of keys) {
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(t);
    }
  }
  return (input) => {
    const raw = String(input ?? "").trim();
    if (!raw) return { teacher: null };
    const byMail = byEmail.get(raw.toLowerCase());
    if (byMail) return { teacher: byMail };
    const matches = byName.get(normalizeText(raw)) || [];
    if (matches.length === 1) return { teacher: matches[0] };
    return { teacher: null, ambiguous: matches.length > 1 };
  };
};

const loadTeacherMatcher = async () =>
  buildTeacherMatcher(await UserModel.find({ role: "teacher" }).select("firstName lastName email").lean());

const TEACHER_COLUMNS = {
  firstName: ["prenom", "prenoms", "first name", "firstname"],
  lastName: ["nom", "noms", "nom de famille", "last name", "lastname"],
  email: ["email", "e mail", "mail", "adresse email", "adresse mail"],
  phone: ["telephone", "tel", "phone", "portable", "contact", "numero de telephone", "numero"],
  password: ["mot de passe", "password"],
};

/**
 * Import des enseignants. Chaque compte créé reçoit un mot de passe provisoire unique
 * (renvoyé dans `credentials`) et devra le changer à la première connexion.
 */
const importTeachersFromExcel = async (fileBuffer) => {
  const rows = readFirstSheet(fileBuffer);
  const columns = createColumnResolver(rows, TEACHER_COLUMNS);
  assertRequiredColumns(columns, ["firstName", "lastName", "email"], {
    firstName: "Prénom",
    lastName: "Nom",
    email: "Email",
  });

  const result = { totalRows: rows.length, created: 0, errors: [], credentials: [] };

  // Comptes existants chargés en une seule requête (les emails sont enregistrés en minuscules)
  const fileEmails = rows
    .map((row) => columns.get(row, "email"))
    .filter(Boolean)
    .map((e) => String(e).trim().toLowerCase());
  const existingByEmail = new Map((await UserModel.find({ email: { $in: fileEmails } }).lean()).map((u) => [u.email, u]));
  const seenEmails = new Set();
  const phoneUpdates = []; // { line, op }
  const newTeachers = []; // { line, doc, credential }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const line = `Ligne ${i + 2}`;
    try {
      const firstName = columns.get(row, "firstName");
      const lastName = columns.get(row, "lastName");
      const rawEmail = columns.get(row, "email");
      const phone = normalizePhone(columns.get(row, "phone")) || undefined;
      const filePassword = columns.get(row, "password");

      if (!firstName && !lastName && !rawEmail) continue;
      if (!firstName || !lastName || !rawEmail) throw new Error("Champs requis manquants (Nom, Prénom, Email)");

      const email = String(rawEmail).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`Email invalide : ${rawEmail}`);
      if (seenEmails.has(email)) throw new Error(`L'email ${email} apparaît plusieurs fois dans le fichier.`);
      seenEmails.add(email);

      const existingUser = existingByEmail.get(email);
      if (existingUser) {
        if (existingUser.role !== "teacher") {
          throw new Error(`L'email ${email} appartient déjà à un compte « ${existingUser.role} ».`);
        }
        if (!existingUser.phone && phone) {
          phoneUpdates.push({ line, op: { updateOne: { filter: { _id: existingUser._id }, update: { $set: { phone } } } } });
        }
        result.errors.push(`${line}: L'enseignant ${email} existe déjà (non modifié).`);
        continue;
      }

      const useFilePassword = typeof filePassword === "string" && filePassword.length >= MIN_PASSWORD_LENGTH;
      const temporaryPassword = useFilePassword ? String(filePassword) : generateTemporaryPassword();
      const doc = {
        firstName: String(firstName),
        lastName: String(lastName),
        email,
        phone,
        password: useFilePassword ? await hashPassword(temporaryPassword) : await hashTemporaryPassword(temporaryPassword),
        role: "teacher",
        mustChangePassword: true,
      };
      const invalid = await validationError(UserModel, doc);
      if (invalid) throw new Error(invalid);

      newTeachers.push({
        line,
        doc,
        credential: {
          name: `${lastName} ${firstName}`,
          role: "teacher",
          login: email,
          temporaryPassword: useFilePassword ? null : temporaryPassword,
          note: useFilePassword ? "Mot de passe défini dans le fichier" : undefined,
        },
      });
    } catch (err) {
      result.errors.push(`${line}: ${err.message}`);
    }
  }

  const [failedUpdates, failedInserts] = await Promise.all([
    bulkWriteSafe(UserModel, phoneUpdates.map((u) => u.op)),
    insertManySafe(UserModel, newTeachers.map((t) => t.doc)),
  ]);
  failedUpdates.forEach((f) => result.errors.push(`${phoneUpdates[f.index].line}: ${f.message}`));
  failedInserts.forEach((f) => result.errors.push(`${newTeachers[f.index].line}: ${f.message}`));
  const rejected = new Set(failedInserts.map((f) => f.index));
  newTeachers.forEach((t, i) => {
    if (rejected.has(i)) return;
    result.created++;
    result.credentials.push(t.credential);
  });

  return result;
};

module.exports = {
  createUser,
  findUserByEmail,
  updateUser,
  changePassword,
  importTeachersFromExcel,
  buildTeacherMatcher,
  loadTeacherMatcher,
};
