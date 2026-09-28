const env = require('./src/config/env');
const app = require('./src/app');
const { connectDB, mongoose } = require('./src/config/db');
const { redis } = require('./src/config/redis');
const { lock } = require('./src/utils/cache');
const { expireStaleOrders } = require('./src/services/orderService');

(async () => {
  await connectDB();
  const server = app.listen(env.PORT, () => console.log(`[${env.APP_NAME}] http://localhost:${env.PORT} (${env.NODE_ENV})`));

  // Release stock held by unpaid orders. The Redis lock makes only one instance run it per cycle.
  const job = setInterval(async () => {
    try { if (await lock('expire-orders', 240)) { const n = await expireStaleOrders(); if (n) console.log(`[jobs] expired ${n} unpaid orders`); } }
    catch (e) { console.error('[jobs]', e.message); }
  }, 5 * 60 * 1000);
  job.unref();

  const shutdown = async (sig) => {
    console.log(`${sig} received, shutting down`);
    server.close(async () => { await mongoose.disconnect(); redis?.disconnect(); process.exit(0); });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  ['SIGTERM', 'SIGINT'].forEach((s) => process.on(s, () => shutdown(s)));
})().catch((e) => { console.error('Startup failed:', e.message); process.exit(1); });
