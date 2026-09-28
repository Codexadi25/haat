const Razorpay = require('razorpay');
const crypto = require('crypto');
const env = require('../config/env');

const client = env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET
  ? new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET })
  : null;

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');

// Checkout callback: HMAC(order_id|payment_id) signed with the key secret.
const verifyPayment = (orderId, paymentId, signature) =>
  !!env.RAZORPAY_KEY_SECRET && safeEqual(hmac(env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`), signature);

// Webhook: HMAC of the raw request body signed with the webhook secret.
const verifyWebhook = (rawBody, signature) =>
  !!env.RAZORPAY_WEBHOOK_SECRET && !!signature && safeEqual(hmac(env.RAZORPAY_WEBHOOK_SECRET, rawBody), signature);

module.exports = { client, verifyPayment, verifyWebhook, keyId: env.RAZORPAY_KEY_ID };
