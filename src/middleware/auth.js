const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/env');
const { User } = require('../models');
const { ApiError, asyncHandler } = require('../utils/helpers');
const { isRevoked, getJSON, setJSON } = require('../utils/cache');

const signToken = (user) => jwt.sign(
  { sub: String(user._id), role: user.role, jti: crypto.randomUUID() },
  env.JWT_SECRET, { expiresIn: `${env.JWT_TTL_HOURS}h` },
);

const setAuthCookie = (res, token) => res.cookie('token', token, {
  httpOnly: true, path: '/', sameSite: env.COOKIE_SAMESITE,
  secure: env.isProd || env.COOKIE_SAMESITE === 'none',
  maxAge: env.JWT_TTL_HOURS * 3600 * 1000,
});

// A short-lived session cache keeps one DB read per user per minute instead of one per request.
async function loadSession(id) {
  const key = `u:${id}`;
  let u = await getJSON(key);
  if (!u) {
    u = await User.findById(id).select('name email role isActive').lean();
    if (u) await setJSON(key, u, 60);
  }
  return u;
}

/** authenticate(true) rejects anonymous calls; authenticate(false) only attaches req.user when valid. */
const authenticate = (required = true) => asyncHandler(async (req, res, next) => {
  const token = req.cookies?.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const fail = (msg) => { if (required) throw new ApiError(401, msg); return next(); };
  if (!token) return fail('Sign in to continue');
  let p;
  try { p = jwt.verify(token, env.JWT_SECRET); } catch { return fail('Your session expired. Sign in again.'); }
  if (await isRevoked(p.jti)) return fail('You are signed out. Sign in again.');
  const u = await loadSession(p.sub);
  if (!u || !u.isActive) return fail('This account is not active.');
  req.user = { id: String(u._id), role: u.role, name: u.name, email: u.email };
  req.jwt = p;
  return next();
});

const allow = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role) ? next() : next(new ApiError(403, 'You do not have access to this'));

/** Page guard: redirect to /login instead of returning JSON. */
const pageAuth = (...roles) => [
  authenticate(false),
  (req, res, next) => {
    if (!req.user) return res.redirect('/login');
    if (!roles.includes(req.user.role)) return res.status(403).render('error', { code: 403, message: 'This area is for a different account type.' });
    return next();
  },
];

/**
 * CSRF defence for cookie sessions: state-changing calls must carry a custom header,
 * which browsers refuse to send cross-site without a CORS preflight we do not grant.
 * Bearer-token clients (React Native) are not cookie-based and are exempt.
 */
const csrfGuard = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.headers.authorization || req.headers['x-requested-with'] === 'XMLHttpRequest') return next();
  return next(new ApiError(403, 'Missing X-Requested-With header'));
};

module.exports = { signToken, setAuthCookie, authenticate, allow, pageAuth, csrfGuard };
