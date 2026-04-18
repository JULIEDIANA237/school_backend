const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: 'c:/Users/GENIUS ELECTRONICS/Documents/projet web/school-backend/.env' });

// Dynamic model definition to avoid needing the full backend setup
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  role: { type: String, required: true }
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);

async function createTeacher() {
  try {
    const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/report_card";
    console.log('Connexion à la DB...', mongoUri);
    await mongoose.connect(mongoUri);
    
    const email = "ngono@gmail.com";
    const exists = await User.findOne({ email });
    
    if (exists) {
      console.log('L\'utilisateur existe déjà. Mise à jour du mot de passe...');
      exists.password = await bcrypt.hash("123456", 10);
      await exists.save();
      console.log('Mot de passe mis à jour avec succès : 123456');
    } else {
      const hashedPassword = await bcrypt.hash("123456", 10);
      await User.create({
        email,
        password: hashedPassword,
        firstName: "Ferdinand",
        lastName: "NGONO",
        role: "teacher"
      });
      console.log('Utilisateur créé avec succès !');
      console.log('Email:', email);
      console.log('Mot de passe: 123456');
    }
    
    await mongoose.disconnect();
  } catch (err) {
    console.error('Erreur lors de la création:', err);
  }
}

createTeacher();
