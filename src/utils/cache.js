const crypto = require('crypto');
const { redis } = require('../config/redis');

// Every helper swallows Redis failures: the site must keep working when Redis is down.
const safe = async (fn, fallback = null) => {
  if (!redis) return fallback;
  try { return await fn(redis); } catch { return fallback; }
};

/**
 * Version-namespaced cache. bump(ns) invalidates every key of a namespace in O(1)
 * by changing the version, so we never SCAN/DEL on the hot path.
 */
async function cached(ns, key, ttlSec, loader) {
  const ver = (await safe((r) => r.get(`ver:${ns}`))) || '0';
  const k = `c:${ns}:${ver}:${crypto.createHash('sha1').update(key).digest('hex')}`;
  const hit = await safe((r) => r.get(k));
  if (hit) return JSON.parse(hit);
  const data = await loader();
  safe((r) => r.set(k, JSON.stringify(data), 'EX', ttlSec));
  return data;
}
const bump = (ns) => safe((r) => r.incr(`ver:${ns}`));

const revokeToken = (jti, ttlSec) => safe((r) => r.set(`rv:${jti}`, '1', 'EX', Math.max(1, ttlSec)));
const isRevoked = async (jti) => !!(await safe((r) => r.get(`rv:${jti}`)));

const getJSON = async (k) => { const v = await safe((r) => r.get(k)); return v ? JSON.parse(v) : null; };
const setJSON = (k, v, ttl) => safe((r) => r.set(k, JSON.stringify(v), 'EX', ttl));
const del = (k) => safe((r) => r.del(k));

// Single-runner lock for background jobs when several instances run.
const lock = async (name, ttlSec) => {
  if (!redis) return true;
  return (await safe((r) => r.set(`lock:${name}`, '1', 'EX', ttlSec, 'NX'), 'OK')) === 'OK';
};

module.exports = { cached, bump, revokeToken, isRevoked, getJSON, setJSON, del, lock };
