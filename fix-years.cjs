const mongoose = require('mongoose');
const SchoolYear = require('./src/modules/schoolYear/schoolYear.model');
const dotenv = require('dotenv');

dotenv.config();

async function fixYears() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/report_card');
    console.log('Connected to MongoDB');

    // Mettre à jour toutes les années à isCurrent: false
    await SchoolYear.updateMany({}, { isCurrent: false });

    // Chercher ou créer 2026-2027
    let year2627 = await SchoolYear.findOne({ name: '2026-2027' });
    if (!year2627) {
      console.log('Creating 2026-2027');
      year2627 = await SchoolYear.create({
        name: '2026-2027',
        isCurrent: true,
        isActive: true,
        startDate: new Date('2026-09-01'),
        endDate: new Date('2027-06-30')
      });
    } else {
      console.log('Updating 2026-2027 to Current');
      year2627.isCurrent = true;
      year2627.isActive = true;
      await year2627.save();
    }

    console.log('Done!');
    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
  }
}

fixYears();
