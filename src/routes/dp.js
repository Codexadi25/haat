// Delivery partner (DP) API.
const router = require('express').Router();
const { User, Order } = require('../models');
const v = require('../validators');
const validate = require('../middleware/validate');
const { authenticate, allow } = require('../middleware/auth');
const svc = require('../services/orderService');
const { asyncHandler, ok, listQuery } = require('../utils/helpers');

router.use(authenticate(), allow('dp'));

router.get('/orders', asyncHandler(async (req, res) => {
  const active = ['confirmed', 'preparing', 'ready', 'picked_up'];
  const base = { deliveryPartner: req.user.id, status: req.query.scope === 'done' ? { $nin: active } : { $in: active } };
  const r = await listQuery(Order, req, { base, search: ['orderNo'], select: '-payment' });
  res.json({ success: true, data: r });
}));

router.patch('/orders/:id/status', validate(v.status), asyncHandler(async (req, res) => {
  ok(res, await svc.changeStatus(req.user, req.params.id, req.body.status, req.body.note));
}));

router.patch('/availability', validate(v.availability), asyncHandler(async (req, res) => {
  ok(res, await User.findByIdAndUpdate(req.user.id, { $set: { isAvailable: req.body.isAvailable } }, { new: true }));
}));

router.get('/me', asyncHandler(async (req, res) => ok(res, await User.findById(req.user.id))));

module.exports = router;
