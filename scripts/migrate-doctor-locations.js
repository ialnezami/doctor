// Try apps/api/.env first, fall back to repo root .env
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../apps/api/.env') });
if (!process.env.MONGODB_URI) {
  require('dotenv').config({ path: path.join(__dirname, '../.env') });
}
const mongoose = require('mongoose');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const col = mongoose.connection.collection('doctors');

  // Only migrate doctors that have availabilitySlots AND no locations yet
  const docs = await col.find({
    availabilitySlots: { $exists: true, $not: { $size: 0 } },
    $or: [{ locations: { $exists: false } }, { locations: { $size: 0 } }],
  }).toArray();

  console.log(`Migrating ${docs.length} doctor(s)...`);

  for (const doc of docs) {
    const location = {
      _id:         new mongoose.Types.ObjectId(),
      name:        'Main Clinic',
      address:     doc.clinicAddress || '',
      coordinates: { type: 'Point', coordinates: [0, 0] },
      type:        'bookable',
      contactNote: '',
      slots:       doc.availabilitySlots || [],
    };
    await col.updateOne(
      { _id: doc._id },
      { $set: { locations: [location] }, $unset: { availabilitySlots: '' } }
    );
  }

  console.log('Migration complete.');
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
