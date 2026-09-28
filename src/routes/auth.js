const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { User } = require('../models');
const env = require('../config/env');
const v = require('../validators');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { login } = require('../services/authService');
const email = require('../services/email');
const { asyncHandler, ok, ApiError } = require('../utils/helpers');
const { revokeToken, del } = require('../utils/cache');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 15, standardHeaders: true, legacyHeaders: false, passOnStoreError: true,
  message: { success: false, message: 'Too many attempts. Try again in a few minutes.' },
});
exports.loginLimiter = loginLimiter;

// Customers self-register. Mx and DP accounts are onboarded by an admin.
router.post('/register', loginLimiter, validate(v.register), asyncHandler(async (req, res) => {
  const { password, ...rest } = req.body;
  await User.create({ ...rest, role: 'cx', passwordHash: await User.hash(password) });
  ok(res, await login(res, rest.email, password, ['cx']), 201);
}));

router.post('/login', loginLimiter, validate(v.login), asyncHandler(async (req, res) => {
  ok(res, await login(res, req.body.email, req.body.password, ['cx', 'mx', 'dp']));
}));

router.post('/password-reset/request', loginLimiter, validate(v.passwordResetRequest), asyncHandler(async (req, res) => {
  if (!email.isConfigured) throw new ApiError(503, 'Password reset email is not configured. Contact an administrator.');
  const user = await User.findOne({ email: req.body.email, role: { $ne: 'admin' } }).select('_id email');
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await User.updateOne({ _id: user._id }, { $set: { passwordResetTokenHash: tokenHash, passwordResetExpiresAt: new Date(Date.now() + 5 * 60 * 1000) } });
    const link = new URL('/login', env.APP_URL);
    link.searchParams.set('reset', token);
    await email.sendPasswordReset(user.email, link.toString());
  }
  ok(res, { message: 'If that email is registered, a password reset link has been sent.' });
}));

router.post('/password-reset/confirm', loginLimiter, validate(v.passwordResetConfirm), asyncHandler(async (req, res) => {
  const tokenHash = crypto.createHash('sha256').update(req.body.token).digest('hex');
  const passwordHash = await User.hash(req.body.password);
  const user = await User.findOneAndUpdate(
    { passwordResetTokenHash: tokenHash, passwordResetExpiresAt: { $gt: new Date() } },
    { $set: { passwordHash }, $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1 } },
    { new: true },
  );
  if (!user) throw new ApiError(400, 'This password reset link is invalid or has expired. Request a new one.');
  ok(res, { message: 'Password updated. You can now sign in.' });
}));

router.post('/logout', authenticate(false), asyncHandler(async (req, res) => {
  if (req.jwt) await revokeToken(req.jwt.jti, req.jwt.exp - Math.floor(Date.now() / 1000));
  res.clearCookie('token', { path: '/' });
  ok(res, { loggedOut: true });
}));

router.get('/me', authenticate(), asyncHandler(async (req, res) => {
  ok(res, await User.findById(req.user.id));
}));

router.patch('/me', authenticate(), validate(v.profile), asyncHandler(async (req, res) => {
  const u = await User.findByIdAndUpdate(req.user.id, { $set: req.body }, { new: true, runValidators: true });
  if (!u) throw new ApiError(404, 'Account not found');
  await del(`u:${req.user.id}`);
  ok(res, u);
}));

module.exports.router = router;
