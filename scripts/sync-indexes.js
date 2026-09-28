// Run on deploy (production has autoIndex off): npm run indexes
require('../src/config/env');
const { connectDB, mongoose } = require('../src/config/db');
const models = require('../src/models');

(async () => {
  await connectDB();
  for (const [name, M] of Object.entries(models)) { await M.syncIndexes(); console.log('indexes synced:', name); }
  await mongoose.disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
