// Admin API: /api/v2/admin - full access, onboarding, dispatch, Recycle Bin.
const crypto = require('crypto');
const router = require('express').Router();
const mongoose = require('mongoose');
const { User, Store, Product, Order } = require('../models');
const v = require('../validators');
const validate = require('../middleware/validate');
const { authenticate, allow } = require('../middleware/auth');
const { login } = require('../services/authService');
const catalog = require('../services/catalog');
const svc = require('../services/orderService');
const { loginLimiter } = require('./auth');
const { asyncHandler, ok, ApiError, listQuery, uniqueSlug } = require('../utils/helpers');
const { cached, revokeToken, del } = require('../utils/cache');
const { redis } = require('../config/redis');

// ---- Admin login (only admins may sign in here) ----
router.post('/login', loginLimiter, validate(v.login), asyncHandler(async (req, res) => {
  ok(res, await login(res, req.body.email, req.body.password, ['admin']));
}));
router.post('/logout', authenticate(false), asyncHandler(async (req, res) => {
  if (req.jwt) await revokeToken(req.jwt.jti, req.jwt.exp - Math.floor(Date.now() / 1000));
  res.clearCookie('token', { path: '/' });
  ok(res, { loggedOut: true });
}));

router.use(authenticate(), allow('admin'));

const MODELS = { users: User, stores: Store, products: Product, orders: Order };
const LIST = {
  users: { search: ['name', 'email', 'phone'], filters: ['role', 'isActive'] },
  stores: { search: ['name', 'category', 'phone'], filters: ['status', 'category', 'isOpen'], populate: { path: 'owner', select: 'name email phone' } },
  products: { search: ['name', 'sku', 'category'], filters: ['store', 'category', 'isListed'], populate: { path: 'store', select: 'name' } },
  orders: { search: ['orderNo', 'customerSnapshot.name', 'customerSnapshot.phone'], filters: ['status', 'store', 'deliveryPartner', 'payment.status'], select: '-payment.razorpaySignature' },
};
const model = (req) => {
  const M = MODELS[req.params.model];
  if (!M) throw new ApiError(404, 'Unknown collection');
  return { M, cfg: LIST[req.params.model] };
};
const tempPassword = () => crypto.randomBytes(7).toString('base64url');

// ---- Overview ----
router.get('/stats', asyncHandler(async (req, res) => {
  const data = await cached('stats', 'admin', 60, async () => {
    const since = new Date(Date.now() - 6 * 864e5); since.setHours(0, 0, 0, 0);
    const [roles, stores, byStatus, revenue, daily, bin] = await Promise.all([
      User.aggregate([{ $group: { _id: '$role', n: { $sum: 1 } } }]),
      Store.countDocuments({ status: 'approved' }),
      Order.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      Order.aggregate([{ $match: { 'payment.status': 'paid' } }, { $group: { _id: null, total: { $sum: '$amounts.total' } } }]),
      Order.aggregate([
        { $match: { 'payment.status': 'paid', createdAt: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' } }, total: { $sum: '$amounts.total' }, n: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Promise.all(Object.values(MODELS).map((M) => M.countDocuments({ isDeleted: true }))),
    ]);
    return {
      users: Object.fromEntries(roles.map((r) => [r._id, r.n])), stores,
      orders: Object.fromEntries(byStatus.map((r) => [r._id, r.n])),
      revenue: revenue[0]?.total || 0, daily: daily.map((d) => ({ date: d._id, total: d.total, n: d.n })),
      recycle: bin.reduce((a, b) => a + b, 0),
    };
  });
  ok(res, data);
}));

router.get('/notifications', asyncHandler(async (req, res) => {
  const redisState = !redis ? 'not_configured' : redis.status === 'ready' ? 'ready' : 'unavailable';
  ok(res, { redis: redisState });
}));

// ---- Onboarding ----
router.post('/onboard/mx', validate(v.onboardMx), asyncHandler(async (req, res) => {
  const { store, password, ...u } = req.body;
  const pwd = password || tempPassword();
  
  const getCityCode = (city = '') => {
    const cityCodes = { "kanpur nagar": "KNP", "kanpur": "KNP", "mumbai": "MUM", "delhi": "DEL", "new delhi": "NDL", "bengaluru": "BLR", "bangalore": "BLR" };
    const c = city.toLowerCase().trim();
    if (cityCodes[c]) return cityCodes[c];
    const consonants = c.replace(/[^a-z]/g, '').replace(/[aeiou]/g, '');
    return (consonants.substring(0, 3) + 'XXX').substring(0, 3).toUpperCase();
  };
  
  const city = store.address?.city || '';
  const count = await Store.countDocuments({ 'address.city': city }).setOptions({ withDeleted: true }) + 1;
  const storeCode = `MX${getCityCode(city)}${count.toString().padStart(4, '0')}${store.division || 'C'}`;
  
  let user; let created;
  [user] = await User.create([{ ...u, role: 'mx', passwordHash: await User.hash(pwd), onboardedBy: req.user.id }]);
  try {
    [created] = await Store.create([{ ...store, storeCode, owner: user._id, slug: await uniqueSlug(Store, store.name), status: 'approved' }]);
  } catch (err) {
    await User.collection.deleteOne({ _id: user._id });
    throw err;
  }
  
  await catalog.bustCaches();
  ok(res, { user, store: created, temporaryPassword: password ? undefined : pwd }, 201);
}));

router.post('/onboard/dp', validate(v.onboardDp), asyncHandler(async (req, res) => {
  const { password, ...u } = req.body;
  const pwd = password || tempPassword();
  const user = await User.create({ ...u, role: 'dp', passwordHash: await User.hash(pwd), onboardedBy: req.user.id });
  ok(res, { user, temporaryPassword: password ? undefined : pwd }, 201);
}));

// ---- Recycle Bin (declared before /:model so it is not shadowed) ----
router.get('/recycle/:model', asyncHandler(async (req, res) => {
  const { M, cfg } = model(req);
  const r = await listQuery(M, req, { ...cfg, filters: [], base: { isDeleted: true }, sort: { deletedAt: -1 }, select: cfg.select });
  res.json({ success: true, data: r });
}));
router.post('/recycle/:model/:id/restore', asyncHandler(async (req, res) => {
  const { M } = model(req);
  if (M === Store) return ok(res, await catalog.restoreStore(req.params.id));
  if (M === Product) return ok(res, await catalog.restoreProduct({ _id: req.params.id }));
  const doc = await M.findOne({ _id: req.params.id, isDeleted: true });
  if (!doc) throw new ApiError(404, 'Nothing to restore');
  await doc.restore();
  await del(`u:${req.params.id}`);
  return ok(res, doc);
}));

// ---- Orders: dispatch & status (declared before generic /:model) ----
router.patch('/orders/:id/assign', validate(v.assign), asyncHandler(async (req, res) => {
  ok(res, await svc.assignPartner(req.params.id, req.body.dpId, req.user));
}));
router.patch('/orders/:id/status', validate(v.status), asyncHandler(async (req, res) => {
  ok(res, await svc.changeStatus(req.user, req.params.id, req.body.status, req.body.note));
}));

// ---- Users ----
router.post('/users', validate(v.adminUserCreate), asyncHandler(async (req, res) => {
  const { password, ...data } = req.body;
  const pwd = password || tempPassword();
  const user = await User.create({ ...data, passwordHash: await User.hash(pwd), onboardedBy: req.user.id });
  ok(res, { user, temporaryPassword: password ? undefined : pwd }, 201);
}));

router.patch('/users/:id', validate(v.userUpdate), asyncHandler(async (req, res) => {
  const { password, ...rest } = req.body;
  if (req.params.id === req.user.id && rest.isActive === false) throw new ApiError(400, 'You cannot pause your own account');
  const current = await User.findById(req.params.id).select('role isActive');
  if (!current) throw new ApiError(404, 'User not found');
  if (current.role === 'admin' && (rest.role && rest.role !== 'admin' || rest.isActive === false)) {
    const activeAdmins = await User.countDocuments({ role: 'admin', isActive: true });
    if (activeAdmins <= 1) throw new ApiError(400, 'You cannot remove or pause the last active administrator');
  }
  const update = { $set: { ...rest } };
  if (password) {
    update.$set.passwordHash = await User.hash(password);
    update.$unset = { passwordResetTokenHash: 1, passwordResetExpiresAt: 1 };
  }
  const u = await User.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!u) throw new ApiError(404, 'User not found');
  await del(`u:${u._id}`);
  ok(res, u);
}));

// ---- Stores & products (admin has the same powers as the owner, on any store) ----
router.patch('/stores/:id', validate(v.storeAdminUpdate), asyncHandler(async (req, res) => {
  ok(res, await catalog.updateStore({ _id: req.params.id }, req.body));
}));
router.post('/products', validate(v.adminProductCreate), asyncHandler(async (req, res) => {
  const { storeId, ...data } = req.body;
  ok(res, await catalog.createProduct(storeId, data), 201);
}));
router.patch('/products/:id', validate(v.productUpdate), asyncHandler(async (req, res) => {
  ok(res, await catalog.updateProduct({ _id: req.params.id }, req.body));
}));

router.get('/:model', asyncHandler(async (req, res) => {
  const { M, cfg } = model(req);
  res.json({ success: true, data: await listQuery(M, req, cfg) });
}));

router.get('/:model/:id', asyncHandler(async (req, res) => {
  const { M, cfg } = model(req);
  const isOid = mongoose.isValidObjectId(req.params.id);
  const query = isOid ? { _id: req.params.id } : 
    (M === Store ? { $or: [{ storeCode: req.params.id.toUpperCase() }, { slug: req.params.id }] } : 
    (M === Product ? { $or: [{ sku: req.params.id }, { slug: req.params.id }] } : 
    (M === Order ? { orderNo: req.params.id } : null)));
  
  if (!query) throw new ApiError(400, 'Invalid ID format');

  const q = M.findOne(query).setOptions({ withDeleted: true });
  if (cfg.populate) q.populate(cfg.populate);
  if (cfg.select) q.select(cfg.select);
  const doc = await q.lean();
  if (!doc) throw new ApiError(404, 'Record not found');
  ok(res, doc);
}));

router.delete('/:model/:id', asyncHandler(async (req, res) => {
  const { M } = model(req);
  const reason = 'Removed by admin';
  if (M === Store) await catalog.removeStore({ _id: req.params.id }, req.user.id, reason);
  else if (M === Product) await catalog.removeProduct({ _id: req.params.id }, req.user.id, reason);
  else {
    if (M === User && req.params.id === req.user.id) throw new ApiError(400, 'You cannot remove your own account');
    const doc = await M.findById(req.params.id);
    if (!doc) throw new ApiError(404, 'Record not found');
    if (M === User) doc.isActive = false;
    await doc.softDelete(req.user.id, reason);
    if (M === User) await del(`u:${doc._id}`);
  }
  ok(res, { movedToRecycleBin: true });
}));

module.exports = router;
