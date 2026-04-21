const mongoose = require('mongoose');
const SchoolYear = require('./src/modules/schoolYear/schoolYear.model');
const Period = require('./src/modules/periods/period.model');
const dotenv = require('dotenv');

dotenv.config();

async function checkData() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/report_card');
    console.log('Connected to MongoDB');

    const years = await SchoolYear.find();
    console.log('\n--- School Years ---');
    console.log(JSON.stringify(years, null, 2));

    const activePeriod = await Period.findOne({ isActive: true });
    console.log('\n--- Active Period ---');
    console.log(JSON.stringify(activePeriod, null, 2));

    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
  }
}

checkData();
