/**
 * Repère les comptes qui utilisent encore l'ancien mot de passe par défaut (codé en dur dans les
 * anciennes versions et donc public). Le mot de passe à tester est passé en argument : il n'est
 * écrit nulle part dans le code.
 *
 *   node scripts/flag-default-passwords.js "<ancien mot de passe>"            # rapport seul (aucune écriture)
 *   node scripts/flag-default-passwords.js "<ancien mot de passe>" --flag     # impose un changement à la prochaine connexion
 *   node scripts/flag-default-passwords.js "<ancien mot de passe>" --reset    # remplace par des mots de passe provisoires (CSV)
 *
 * --reset est recommandé : avec --flag, quelqu'un qui connaît l'ancien mot de passe peut encore se
 * connecter AVANT le vrai titulaire et choisir son propre mot de passe.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../src/modules/users/user.model");
const {
  generateTemporaryPassword,
  hashTemporaryPassword,
  passwordChangeTimestamp,
} = require("../src/utils/password");

const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

async function main() {
  const [oldPassword, mode] = process.argv.slice(2);
  if (!oldPassword) {
    console.error('Usage : node scripts/flag-default-passwords.js "<ancien mot de passe>" [--flag|--reset]');
    process.exitCode = 1;
    return;
  }
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI n'est pas défini (fichier .env).");
  await mongoose.connect(process.env.MONGO_URI);

  const users = await User.find({}).select("+password email phone firstName lastName role mustChangePassword");
  const matches = [];
  for (const user of users) {
    if (await bcrypt.compare(oldPassword, user.password)) matches.push(user);
  }

  const byRole = matches.reduce((acc, u) => ({ ...acc, [u.role]: (acc[u.role] || 0) + 1 }), {});
  console.log(`${matches.length} compte(s) sur ${users.length} utilisent ce mot de passe :`, byRole);

  if (mode === "--flag") {
    await User.updateMany({ _id: { $in: matches.map((u) => u._id) } }, { mustChangePassword: true });
    console.log("Changement de mot de passe imposé à la prochaine connexion.");
  } else if (mode === "--reset") {
    const rows = [["nom", "role", "identifiant", "mot_de_passe_provisoire"]];
    for (const user of matches) {
      const temporaryPassword = generateTemporaryPassword();
      user.password = await hashTemporaryPassword(temporaryPassword);
      user.mustChangePassword = true;
      user.passwordChangedAt = passwordChangeTimestamp();
      await user.save();
      rows.push([`${user.lastName} ${user.firstName}`, user.role, user.phone || user.email, temporaryPassword]);
    }
    const file = path.resolve(`identifiants-provisoires-${Date.now()}.csv`);
    fs.writeFileSync(file, "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\n"), { mode: 0o600 });
    console.log(`Mots de passe remplacés. Identifiants à distribuer : ${file}`);
    console.log("Supprimez ce fichier après distribution.");
  } else {
    console.log("Rapport seul : relancez avec --reset (recommandé) ou --flag pour agir.");
  }
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
