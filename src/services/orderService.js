const crypto = require('crypto');
const mongoose = require('mongoose');
const env = require('../config/env');
const { User, Store, Product, Order } = require('../models');
const { ApiError, isObjectId } = require('../utils/helpers');
const rzp = require('./razorpay');

const orderNo = () => 'HT' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString('hex').toUpperCase();

/** Who may move an order from one status to another. Payment confirmation is system-only. */
const TRANSITIONS = {
  confirmed: { preparing: ['mx', 'admin'], cancelled: ['mx', 'admin', 'cx'] },
  preparing: { ready: ['mx', 'admin'], cancelled: ['mx', 'admin'] },
  ready: { picked_up: ['dp', 'admin'], cancelled: ['admin'] },
  picked_up: { delivered: ['dp', 'admin'] },
  delivered: { return_requested: ['cx', 'admin'] },
  return_requested: { returned: ['mx', 'admin'], replaced: ['mx', 'admin'], delivered: ['admin'] },
};

/** Role-scoped lookup: a user can only ever reach orders that belong to them. */
async function findAccessible(user, ref) {
  const q = isObjectId(ref) ? { _id: ref } : { orderNo: String(ref) };
  if (user.role === 'cx') q.customer = user.id;
  else if (user.role === 'dp') q.deliveryPartner = user.id;
  else if (user.role === 'mx') {
    const store = await Store.findOne({ owner: user.id }).setOptions({ withDeleted: true }).select('_id');
    if (!store) return null;
    q.store = store._id;
  }
  return Order.findOne(q);
}

async function restoreStock(order) {
  // bulkWrite bypasses soft-delete hooks on purpose: stock returns even for unlisted/removed products.
  await Product.bulkWrite(order.items.map((i) => ({
    updateOne: { filter: { _id: i.product }, update: { $inc: { stock: i.qty } } },
  })));
}

async function refundIfPaid(order, reason) {
  if (order.payment.status !== 'paid' || !order.payment.razorpayPaymentId) return order;
  try {
    if (!rzp.client) throw new Error('Razorpay not configured');
    const r = await rzp.client.payments.refund(order.payment.razorpayPaymentId, {
      amount: order.amounts.total, speed: 'normal', notes: { orderNo: order.orderNo, reason: String(reason || '').slice(0, 200) },
    });
    order.payment.status = 'refunded'; order.payment.refundId = r.id; order.payment.refundedAt = new Date();
  } catch (e) {
    console.error('[refund]', order.orderNo, e.error?.description || e.message);
    order.payment.status = 'refund_failed'; // surfaces in the admin panel for manual follow-up
  }
  await order.save();
  return order;
}

async function createOrder({ user, storeId, items, address, notes }) {
  if (!rzp.client) throw new ApiError(503, 'Payments are not configured yet');
  const ids = items.map((i) => i.productId);
  if (new Set(ids).size !== ids.length) throw new ApiError(422, 'Each product can appear only once');

  const store = await Store.findOne({ _id: storeId, status: 'approved', isOpen: true });
  if (!store) throw new ApiError(400, 'This store is closed or unavailable right now');
  const customer = await User.findById(user.id).select('name email phone');

  const session = await mongoose.startSession();
  let order;
  try {
    // Stock reservation and order creation succeed or fail together.
    await session.withTransaction(async () => {
      const products = await Product.find({ _id: { $in: ids }, store: store._id, isListed: true }).session(session);
      if (products.length !== ids.length) throw new ApiError(400, 'Some items are no longer available');
      const byId = new Map(products.map((p) => [String(p._id), p]));

      const lines = []; let subtotal = 0;
      for (const it of items) {
        const p = byId.get(it.productId);
        // Atomic guard: decrements only while enough stock remains, so two buyers can never oversell.
        const r = await Product.updateOne({ _id: p._id, stock: { $gte: it.qty } }, { $inc: { stock: -it.qty } }, { session });
        if (!r.modifiedCount) throw new ApiError(409, `Only limited stock is left for ${p.name}`);
        const lineTotal = p.price * it.qty; subtotal += lineTotal;
        lines.push({ product: p._id, name: p.name, sku: p.sku, image: p.images?.[0], unit: p.unit, unitPrice: p.price, mrp: p.mrp, qty: it.qty, lineTotal });
      }
      if (subtotal < (store.minOrder || 0)) throw new ApiError(400, `Minimum order for this store is ₹${(store.minOrder / 100).toFixed(0)}`);

      const deliveryFee = store.deliveryFee ?? env.DELIVERY_FEE_PAISE;
      [order] = await Order.create([{
        orderNo: orderNo(),
        customer: customer._id, customerSnapshot: { name: customer.name, email: customer.email, phone: customer.phone },
        store: store._id, storeSnapshot: { name: store.name, phone: store.phone, address: store.address },
        items: lines, address, notes,
        amounts: { subtotal, deliveryFee, tax: 0, total: subtotal + deliveryFee },
        statusHistory: [{ status: 'pending_payment', by: 'cx', byUser: customer._id, note: 'Order placed' }],
      }], { session });
    });
  } finally { await session.endSession(); }

  try {
    const rp = await rzp.client.orders.create({
      amount: order.amounts.total, currency: 'INR', receipt: order.orderNo, notes: { orderId: String(order._id) },
    });
    order.payment.razorpayOrderId = rp.id;
    await order.save();
  } catch (e) {
    console.error('[razorpay:create]', e.error?.description || e.message);
    await cancelSystem(order, 'Payment gateway unavailable');
    throw new ApiError(502, 'Payment gateway is unavailable. Try again in a moment.');
  }
  return order;
}

const paymentParams = (o) => ({
  keyId: rzp.keyId, razorpayOrderId: o.payment.razorpayOrderId, amount: o.amounts.total, currency: 'INR',
  name: env.APP_NAME, description: `Order ${o.orderNo}`,
});

/** System cancel (expiry / gateway failure). Guarded on status so it cannot race a payment confirmation. */
async function cancelSystem(order, note) {
  const o = await Order.findOneAndUpdate(
    { _id: order._id, status: 'pending_payment' },
    { $set: { status: 'cancelled', cancelReason: note }, $push: { statusHistory: { status: 'cancelled', by: 'system', note } } },
    { new: true },
  );
  if (o) await restoreStock(o);
  return o;
}

async function expireStaleOrders() {
  const cutoff = new Date(Date.now() - env.PENDING_ORDER_TTL_MIN * 60000);
  const stale = await Order.find({ status: 'pending_payment', createdAt: { $lt: cutoff } }).limit(100);
  for (const o of stale) await cancelSystem(o, 'Payment not completed in time');
  return stale.length;
}

/** Idempotent: safe to call from both the checkout callback and the webhook. */
async function markPaid({ razorpayOrderId, paymentId, signature, source }) {
  const set = {
    status: 'confirmed', 'payment.status': 'paid', 'payment.razorpayPaymentId': paymentId, 'payment.paidAt': new Date(),
  };
  if (signature) set['payment.razorpaySignature'] = signature;
  const order = await Order.findOneAndUpdate(
    { 'payment.razorpayOrderId': razorpayOrderId, status: 'pending_payment' },
    { $set: set, $push: { statusHistory: { status: 'confirmed', by: source, note: 'Payment received' } } },
    { new: true },
  );
  if (order) return order;

  const existing = await Order.findOne({ 'payment.razorpayOrderId': razorpayOrderId });
  // Money arrived after we expired the order: give it back.
  if (existing && existing.status === 'cancelled' && existing.payment.status === 'created') {
    existing.payment.razorpayPaymentId = paymentId; existing.payment.status = 'paid';
    await refundIfPaid(existing, 'Payment received after order expired');
  }
  return existing;
}

async function changeStatus(actor, ref, to, note) {
  const order = await findAccessible(actor, ref);
  if (!order) throw new ApiError(404, 'Order not found');
  const allowed = TRANSITIONS[order.status]?.[to];
  if (!allowed || !allowed.includes(actor.role)) {
    throw new ApiError(409, `An order that is ${order.status.replace(/_/g, ' ')} cannot be moved to ${to.replace(/_/g, ' ')}`);
  }
  if (to === 'picked_up' && !order.deliveryPartner) throw new ApiError(409, 'Assign a delivery partner first');

  const $set = { status: to };
  if (to === 'cancelled') $set.cancelReason = note || 'Cancelled';
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: order.status },
    { $set, $push: { statusHistory: { status: to, by: actor.role, byUser: actor.id, note } } },
    { new: true },
  );
  if (!updated) throw new ApiError(409, 'This order just changed. Refresh and try again.');

  if (to === 'cancelled') { await restoreStock(updated); await refundIfPaid(updated, note || 'Cancelled'); }
  if (to === 'returned') { await restoreStock(updated); await refundIfPaid(updated, 'Return accepted'); }
  return updated;
}

async function requestReturn(actor, ref, { kind, reason }) {
  const order = await findAccessible(actor, ref);
  if (!order) throw new ApiError(404, 'Order not found');
  if (order.status !== 'delivered') throw new ApiError(409, 'Only delivered orders can be returned or replaced');
  const deliveredAt = [...order.statusHistory].reverse().find((h) => h.status === 'delivered')?.at || order.updatedAt;
  if (Date.now() - new Date(deliveredAt).getTime() > env.RETURN_WINDOW_DAYS * 864e5) {
    throw new ApiError(409, `The ${env.RETURN_WINDOW_DAYS}-day return window has closed`);
  }
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: 'delivered' },
    { $set: { status: 'return_requested', returnRequest: { kind, reason, requestedAt: new Date() } },
      $push: { statusHistory: { status: 'return_requested', by: actor.role, byUser: actor.id, note: `${kind}: ${reason}` } } },
    { new: true },
  );
  if (!updated) throw new ApiError(409, 'This order just changed. Refresh and try again.');
  return updated;
}

async function assignPartner(ref, dpId, actor) {
  const dp = await User.findOne({ _id: dpId, role: 'dp', isActive: true }).select('name phone');
  if (!dp) throw new ApiError(404, 'Delivery partner not found or inactive');
  const order = await findAccessible(actor, ref);
  if (!order) throw new ApiError(404, 'Order not found');
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: { $in: ['confirmed', 'preparing', 'ready'] } },
    { $set: { deliveryPartner: dp._id, dpSnapshot: { name: dp.name, phone: dp.phone } },
      $push: { statusHistory: { status: order.status, by: actor.role, byUser: actor.id, note: `Assigned to ${dp.name}` } } },
    { new: true },
  );
  if (!updated) throw new ApiError(409, 'A partner can only be assigned before pickup');
  return updated;
}

module.exports = {
  createOrder, paymentParams, markPaid, changeStatus, requestReturn, assignPartner,
  expireStaleOrders, findAccessible, refundIfPaid,
};
