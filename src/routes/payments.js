const router = require('express').Router();
const { Order } = require('../models');
const v = require('../validators');
const validate = require('../middleware/validate');
const { authenticate, allow } = require('../middleware/auth');
const rzp = require('../services/razorpay');
const svc = require('../services/orderService');
const { asyncHandler, ok, ApiError } = require('../utils/helpers');

// Called by checkout.js after the customer pays. The signature proves Razorpay issued it.
router.post('/verify', authenticate(), allow('cx'), validate(v.payVerify), asyncHandler(async (req, res) => {
  const { razorpay_order_id: oid, razorpay_payment_id: pid, razorpay_signature: sig } = req.body;
  if (!rzp.verifyPayment(oid, pid, sig)) throw new ApiError(400, 'Payment signature could not be verified');
  const owned = await Order.exists({ 'payment.razorpayOrderId': oid, customer: req.user.id });
  if (!owned) throw new ApiError(404, 'Order not found');
  const order = await svc.markPaid({ razorpayOrderId: oid, paymentId: pid, signature: sig, source: 'system' });
  ok(res, { orderNo: order.orderNo, status: order.status });
}));

/**
 * Razorpay webhook - the source of truth when the browser closes mid-payment.
 * Mounted in app.js with express.raw() so the HMAC is computed on the exact bytes received.
 */
const webhook = asyncHandler(async (req, res) => {
  const raw = req.body; // Buffer
  if (!rzp.verifyWebhook(raw, req.headers['x-razorpay-signature'])) return res.status(400).json({ success: false });
  const evt = JSON.parse(raw.toString('utf8'));
  const pay = evt.payload?.payment?.entity;

  if ((evt.event === 'payment.captured' || evt.event === 'order.paid') && pay?.order_id) {
    await svc.markPaid({ razorpayOrderId: pay.order_id, paymentId: pay.id, source: 'razorpay' });
  } else if (evt.event === 'refund.processed') {
    const rf = evt.payload?.refund?.entity;
    if (rf?.payment_id) {
      await Order.updateOne({ 'payment.razorpayPaymentId': rf.payment_id }, {
        $set: { 'payment.status': 'refunded', 'payment.refundId': rf.id, 'payment.refundedAt': new Date() },
      });
    }
  }
  return res.json({ success: true }); // always 200 for handled/ignored events so Razorpay stops retrying
});

module.exports = { router, webhook };
