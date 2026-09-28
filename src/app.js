const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const expressLayouts = require('express-ejs-layouts');
const { RedisStore } = require('rate-limit-redis');

const env = require('./config/env');
const { redis } = require('./config/redis');
const { csrfGuard } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/error');
const payments = require('./routes/payments');

const app = express();
app.set('trust proxy', 1); // correct client IPs behind Render / Railway / Nginx
app.disable('x-powered-by');
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  res.locals.appName = env.APP_NAME;
  res.locals.bodyClass = '';
  res.locals.gaMeasurementId = env.GA_MEASUREMENT_ID || '';
  next();
});

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`, 'https://checkout.razorpay.com', 'https://www.googletagmanager.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:', 'https://www.google-analytics.com'],
      connectSrc: ["'self'", 'https://lumberjack.razorpay.com', 'https://api.razorpay.com', 'https://www.google-analytics.com'],
      frameSrc: ["'self'", 'https://api.razorpay.com', 'https://checkout.razorpay.com'],
      objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"], frameAncestors: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(compression());
app.use(morgan(env.isProd ? 'combined' : 'dev'));

// Razorpay webhook needs the untouched raw body for signature verification, so it is mounted before express.json().
app.post('/api/v2/payments/webhook', express.raw({ type: '*/*', limit: '1mb' }), payments.webhook);

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: env.isProd ? '7d' : 0 }));

// ---- API ----
let rateLimitStore;
if (redis?.status === 'ready') {
  try {
    rateLimitStore = new RedisStore({ sendCommand: (...args) => redis.call(...args), prefix: 'rl:api:' });
  } catch (e) {
    console.warn('[rate-limit] Redis store unavailable; using in-memory limits:', e.message);
  }
}
const limiter = rateLimit({
  windowMs: 60 * 1000, max: 240, standardHeaders: true, legacyHeaders: false, passOnStoreError: true,
  store: rateLimitStore,
  message: { success: false, message: 'Too many requests. Slow down a little.' },
});

const api = express.Router();
api.use(limiter);
api.use('/', require('./routes/public')); // open: /products, /stores (own permissive CORS)
api.use(cors({ origin: env.CORS_ORIGINS.length ? env.CORS_ORIGINS : false, credentials: true }));
api.use(csrfGuard);
api.use('/auth', require('./routes/auth').router);
const { authenticate } = require('./middleware/auth');
api.use('/media', authenticate(), require('./routes/mediaRoutes'));
api.use('/admin', require('./routes/admin'));
api.use('/mx', require('./routes/mx'));
api.use('/dp', require('./routes/dp'));
api.use('/orders', require('./routes/orders'));
api.use('/payments', payments.router);
app.use('/api/v2', api);

// ---- Server-rendered panels ----
app.use('/', require('./routes/pages'));

app.use(notFound);
app.use(errorHandler);
module.exports = app;
