const mongoose = require('mongoose');
require('dotenv').config({ path: 'c:/Users/GENIUS ELECTRONICS/Documents/projet web/school-backend/.env' });

const UserSchema = new mongoose.Schema({
  email: String,
  firstName: String,
  lastName: String,
  role: String
}, { strict: false });

const User = mongoose.model('User', UserSchema);

async function checkUsers() {
  try {
    const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/report_card";
    await mongoose.connect(mongoUri);
    console.log('Connected to DB:', mongoUri);
    
    const users = await User.find({}, 'email firstName lastName role');
    console.log('--- Users in Database ---');
    console.log(JSON.stringify(users, null, 2));
    console.log('-------------------------');
    
    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
  }
}

checkUsers();
