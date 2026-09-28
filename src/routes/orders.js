// Customer (Cx) order API - consumed by the React storefront and the /account panel.
const router = require('express').Router();
const { Order } = require('../models');
const v = require('../validators');
const validate = require('../middleware/validate');
const { authenticate, allow } = require('../middleware/auth');
const svc = require('../services/orderService');
const { asyncHandler, ok, ApiError, listQuery } = require('../utils/helpers');

router.use(authenticate());

router.post('/', allow('cx'), validate(v.orderCreate), asyncHandler(async (req, res) => {
  const order = await svc.createOrder({ user: req.user, ...req.body });
  ok(res, { order, payment: svc.paymentParams(order) }, 201);
}));

router.get('/', allow('cx'), asyncHandler(async (req, res) => {
  const { items, meta } = await listQuery(Order, req, {
    base: { customer: req.user.id }, filters: ['status'], search: ['orderNo'], select: '-payment.razorpaySignature',
  });
  res.json({ success: true, data: { items, meta } });
}));

router.get('/:ref', asyncHandler(async (req, res) => {
  const o = await svc.findAccessible(req.user, req.params.ref);
  if (!o) throw new ApiError(404, 'Order not found');
  ok(res, o);
}));

// Re-open checkout for an unpaid order (same Razorpay order, so no duplicate charges).
router.get('/:ref/payment', allow('cx'), asyncHandler(async (req, res) => {
  const o = await svc.findAccessible(req.user, req.params.ref);
  if (!o) throw new ApiError(404, 'Order not found');
  if (o.status !== 'pending_payment') throw new ApiError(409, 'This order does not need payment');
  ok(res, svc.paymentParams(o));
}));

router.post('/:ref/cancel', allow('cx'), validate(v.reason), asyncHandler(async (req, res) => {
  ok(res, await svc.changeStatus(req.user, req.params.ref, 'cancelled', req.body.reason || 'Cancelled by customer'));
}));

router.post('/:ref/return', allow('cx'), validate(v.returnReq), asyncHandler(async (req, res) => {
  ok(res, await svc.requestReturn(req.user, req.params.ref, req.body));
}));

module.exports = router;
