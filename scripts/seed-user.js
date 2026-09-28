const { connectDB, mongoose } = require('../src/config/db');
const { User } = require('../src/models');

(async () => {
  const email = (process.env.SEED_USER_EMAIL || '').trim().toLowerCase();
  const password = process.env.SEED_USER_PASSWORD;
  const name = (process.env.SEED_USER_NAME || 'Creed Racer').trim();

  if (!email || !password || password.length < 8) {
    throw new Error('Set SEED_USER_EMAIL and SEED_USER_PASSWORD (8+ characters)');
  }

  await connectDB();
  const existing = await User.findOne({ email }).setOptions({ withDeleted: true });
  if (existing) throw new Error(`User ${email} already exists; no changes made`);

  await User.create({ name, email, role: 'cx', passwordHash: await User.hash(password) });
  console.log(`Created customer user ${email}`);
  await mongoose.disconnect();
})().catch(async (e) => {
  console.error(e.message);
  await mongoose.disconnect();
  process.exit(1);
});