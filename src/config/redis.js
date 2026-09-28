require('dotenv').config();
const Redis = require('ioredis');
const env = require('./env');

let redis = null;
if (env.REDIS_URL) {
  redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false, // fail fast, callers degrade to the database
    tls: env.REDIS_URL.startsWith('rediss://') ? {} : undefined,
  });
  redis.on('error', (e) => console.error('[redis]', e.message));
  redis.on('ready', () => console.log('[redis] ready'));
} else {
  console.warn('[redis] REDIS_URL not set - caching, token revocation and shared rate limits are disabled');
}
module.exports = { redis };
