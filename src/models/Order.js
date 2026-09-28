const mongoose = require('mongoose');
const softDelete = require('./plugins/softDelete');
const { Schema } = mongoose;

const STATUSES = ['pending_payment', 'confirmed', 'preparing', 'ready', 'picked_up', 'delivered',
  'cancelled', 'return_requested', 'returned', 'replaced'];

/**
 * Orders are self-contained snapshots. Product, store, customer and partner details are copied
 * at order time, so delivery, returns and replacements keep working even after the product
 * is unlisted or the store is removed.
 */
const itemSchema = new Schema({
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  name: String, sku: String, image: String, unit: String,
  unitPrice: Number, mrp: Number, qty: Number, lineTotal: Number,
}, { _id: false });

const historySchema = new Schema({
  status: String, by: String, byUser: { type: Schema.Types.ObjectId, ref: 'User' }, note: String,
  at: { type: Date, default: Date.now },
}, { _id: false });

const orderSchema = new Schema({
  orderNo: { type: String, required: true, unique: true },
  customer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  customerSnapshot: { name: String, email: String, phone: String },
  store: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
  storeSnapshot: { name: String, phone: String, address: { line1: String, city: String, state: String, pincode: String } },
  items: [itemSchema],
  amounts: { subtotal: Number, deliveryFee: Number, tax: { type: Number, default: 0 }, total: Number },
  address: { label: String, line1: String, line2: String, city: String, state: String, pincode: String, lat: Number, lng: Number },
  notes: String,
  status: { type: String, enum: STATUSES, default: 'pending_payment' },
  statusHistory: [historySchema],
  payment: {
    provider: { type: String, default: 'razorpay' },
    razorpayOrderId: { type: String, index: true, sparse: true },
    razorpayPaymentId: String,
    razorpaySignature: { type: String, select: false },
    status: { type: String, enum: ['created', 'paid', 'failed', 'refunded', 'refund_failed'], default: 'created' },
    paidAt: Date, refundId: String, refundedAt: Date,
  },
  deliveryPartner: { type: Schema.Types.ObjectId, ref: 'User' },
  dpSnapshot: { name: String, phone: String },
  returnRequest: { kind: { type: String, enum: ['return', 'replace'] }, reason: String, requestedAt: Date },
  cancelReason: String,
}, { timestamps: true });

orderSchema.plugin(softDelete);
orderSchema.index({ store: 1, status: 1, createdAt: -1 });
orderSchema.index({ customer: 1, createdAt: -1 });
orderSchema.index({ deliveryPartner: 1, status: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: 1 }); // expiry job

const Order = mongoose.model('Order', orderSchema);
Order.STATUSES = STATUSES;
module.exports = Order;
