const bcrypt = require('bcryptjs');
const { User } = require('../models');
const { ApiError } = require('../utils/helpers');
const { signToken, setAuthCookie } = require('../middleware/auth');

const DUMMY = bcrypt.hashSync('not-a-real-password', 11); // equalises timing for unknown emails

async function login(res, email, password, roles) {
  const user = await User.findOne({ email }).select('+passwordHash');
  const good = user ? await user.verifyPassword(password) : (await bcrypt.compare(password, DUMMY), false);
  if (!good || !roles.includes(user.role)) throw new ApiError(401, 'Email or password is incorrect');
  if (!user.isActive) throw new ApiError(403, 'This account is paused. Contact support.');
  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  const token = signToken(user);
  setAuthCookie(res, token);
  return { user: user.toJSON(), token };
}
module.exports = { login };
