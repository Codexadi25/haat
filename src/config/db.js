const mongoose = require('mongoose');
const env = require('./env');

mongoose.set('strictQuery', true);
// Build indexes automatically in dev; in production run `npm run indexes` on deploy.
mongoose.set('autoIndex', !env.isProd);

async function connectDB() {
  if (env.MONGO_URI.startsWith('mongodb+srv://')) {
    try { require('dns').setServers(['8.8.8.8', '8.8.4.4']); } catch (e) {}
  }
  await mongoose.connect(env.MONGO_URI, {
    maxPoolSize: 10, // stay inside free-tier connection limits
    serverSelectionTimeoutMS: 8000,
  });
  console.log('[mongo] connected');
}
module.exports = { connectDB, mongoose };
