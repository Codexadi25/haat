// Merchant (Mx) API: a store owner manages ONLY their own store, products and orders.
const router = require('express').Router();
const { Store, Product, Order } = require('../models');
const v = require('../validators');
const validate = require('../middleware/validate');
const { authenticate, allow } = require('../middleware/auth');
const catalog = require('../services/catalog');
const svc = require('../services/orderService');
const { asyncHandler, ok, listQuery } = require('../utils/helpers');
const { cached } = require('../utils/cache');

router.use(authenticate(), allow('mx'));

// Resolve the caller's store once; every query below is scoped to it (no store id is accepted from clients).
const withStore = asyncHandler(async (req, res, next) => {
  req.store = await Store.findOne({ owner: req.user.id });
  if (!req.store) return res.status(404).json({ success: false, message: 'No active store is linked to this account' });
  return next();
});

router.get('/store', withStore, (req, res) => ok(res, req.store));
router.patch('/store', withStore, validate(v.storeUpdate), asyncHandler(async (req, res) => {
  ok(res, await catalog.updateStore({ _id: req.store._id }, req.body));
}));
router.delete('/store', withStore, asyncHandler(async (req, res) => {
  await catalog.removeStore({ _id: req.store._id }, req.user.id, 'Removed by merchant');
  ok(res, { movedToRecycleBin: true });
}));

router.get('/stats', withStore, asyncHandler(async (req, res) => {
  const day = new Date(); day.setHours(0, 0, 0, 0);
  const data = await cached('stats', `mx:${req.store._id}`, 30, async () => {
    const [products, lowStock, newOrders, today] = await Promise.all([
      Product.countDocuments({ store: req.store._id }),
      Product.countDocuments({ store: req.store._id, isListed: true, stock: { $lte: 5 } }),
      Order.countDocuments({ store: req.store._id, status: 'confirmed' }),
      Order.aggregate([
        { $match: { store: req.store._id, 'payment.status': 'paid', createdAt: { $gte: day } } },
        { $group: { _id: null, revenue: { $sum: '$amounts.subtotal' }, orders: { $sum: 1 } } },
      ]),
    ]);
    return { products, lowStock, newOrders, todayRevenue: today[0]?.revenue || 0, todayOrders: today[0]?.orders || 0 };
  });
  ok(res, data);
}));

router.get('/products', withStore, asyncHandler(async (req, res) => {
  const r = await listQuery(Product, req, { base: { store: req.store._id }, search: ['name', 'sku', 'category'], filters: ['isListed', 'category'] });
  res.json({ success: true, data: r });
}));
router.post('/products', withStore, validate(v.productCreate), asyncHandler(async (req, res) => {
  ok(res, await catalog.createProduct(req.store._id, req.body), 201);
}));
router.patch('/products/:id', withStore, validate(v.productUpdate), asyncHandler(async (req, res) => {
  ok(res, await catalog.updateProduct({ _id: req.params.id, store: req.store._id }, req.body));
}));
router.delete('/products/:id', withStore, asyncHandler(async (req, res) => {
  await catalog.removeProduct({ _id: req.params.id, store: req.store._id }, req.user.id, 'Removed by merchant');
  ok(res, { movedToRecycleBin: true });
}));

// Recycle bin: the merchant's own removed products can be brought back.
router.get('/recycle', withStore, asyncHandler(async (req, res) => {
  const r = await listQuery(Product, req, { base: { store: req.store._id, isDeleted: true }, search: ['name'], sort: { deletedAt: -1 } });
  res.json({ success: true, data: r });
}));
router.post('/recycle/:id/restore', withStore, asyncHandler(async (req, res) => {
  ok(res, await catalog.restoreProduct({ _id: req.params.id, store: req.store._id }));
}));

router.get('/orders', withStore, asyncHandler(async (req, res) => {
  const r = await listQuery(Order, req, { base: { store: req.store._id }, filters: ['status'], search: ['orderNo', 'customerSnapshot.name'], select: '-payment.razorpaySignature' });
  res.json({ success: true, data: r });
}));
router.patch('/orders/:id/status', validate(v.status), asyncHandler(async (req, res) => {
  ok(res, await svc.changeStatus(req.user, req.params.id, req.body.status, req.body.note));
}));

module.exports = router;
