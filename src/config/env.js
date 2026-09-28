require('dotenv').config();

const need = (k) => {
  if (!process.env[k]) { console.error(`Missing required env var: ${k}`); process.exit(1); }
  return process.env[k];
};
const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT) || 3000,
  APP_NAME: process.env.APP_NAME || 'Haat',
  APP_URL: (process.env.APP_URL || `http://localhost:${Number(process.env.PORT) || 3000}`).replace(/\/+$/, ''),
  MONGO_URI: need('MONGO_URI'),
  REDIS_URL: process.env.REDIS_URL || '',
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: Number(process.env.SMTP_PORT) || 587,
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_FROM: process.env.SMTP_FROM || process.env.SMTP_USER || '',
  EMAILJS_SERVICE_ID: process.env.EMAILJS_SERVICE_ID || '',
  EMAILJS_TEMPLATE_ID: process.env.EMAILJS_TEMPLATE_ID || '',
  EMAILJS_PUBLIC_KEY: process.env.EMAILJS_PUBLIC_KEY || '',
  EMAILJS_PRIVATE_KEY: process.env.EMAILJS_PRIVATE_KEY || '',
  JWT_SECRET: need('JWT_SECRET'),
  JWT_TTL_HOURS: Number(process.env.JWT_TTL_HOURS) || 12,
  COOKIE_SAMESITE: process.env.COOKIE_SAMESITE || 'lax',
  CORS_ORIGINS: list(process.env.CORS_ORIGINS),
  STOREFRONT_URL: process.env.STOREFRONT_URL || '',
  GA_MEASUREMENT_ID: process.env.GA_MEASUREMENT_ID || '',
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || '',
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || '',
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  DELIVERY_FEE_PAISE: Number(process.env.DELIVERY_FEE_PAISE ?? 3000),
  PENDING_ORDER_TTL_MIN: Number(process.env.PENDING_ORDER_TTL_MIN) || 20,
  RETURN_WINDOW_DAYS: Number(process.env.RETURN_WINDOW_DAYS) || 7,
};
env.isProd = env.NODE_ENV === 'production';
module.exports = env;
