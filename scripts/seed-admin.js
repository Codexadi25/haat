// Creates (or resets) the first admin. Usage: ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run seed:admin
const env = require('../src/config/env');
const { connectDB, mongoose } = require('../src/config/db');
const { User } = require('../src/models');

(async () => {
  const email = (process.env.ADMIN_EMAIL || '').toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 8) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (8+ chars)');
  await connectDB();
  const passwordHash = await User.hash(password);
  const existing = await User.findOne({ email }).setOptions({ withDeleted: true });
  if (existing) {
    Object.assign(existing, { role: 'admin', passwordHash, isActive: true, isDeleted: false });
    await existing.save();
    console.log(`Updated admin ${email}`);
  } else {
    await User.create({ name: 'Administrator', email, phone: '9000000000', role: 'admin', passwordHash });
    console.log(`Created admin ${email}`);
  }
  await mongoose.disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
