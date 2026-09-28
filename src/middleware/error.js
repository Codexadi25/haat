const { ZodError } = require('zod');
const env = require('../config/env');

const notFound = (req, res) => {
  if (req.originalUrl.startsWith('/api')) return res.status(404).json({ success: false, message: 'Route not found' });
  return res.status(404).render('error', { code: 404, message: 'This page does not exist.' });
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let status = err.status || 500;
  let message = err.message || 'Something went wrong';
  let details = err.details;

  if (err instanceof ZodError) {
    status = 422; message = err.issues[0]?.message || 'Check the highlighted fields';
    details = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
  } else if (err.code === 11000) {
    status = 409; message = `That ${Object.keys(err.keyPattern || {})[0] || 'value'} is already in use`;
  } else if (err.name === 'CastError') {
    status = 400; message = 'Invalid identifier';
  } else if (err.name === 'ValidationError') {
    status = 422; message = Object.values(err.errors)[0]?.message || 'Validation failed';
  }
  if (status >= 500) { console.error(err); if (env.isProd) message = 'Something went wrong on our side'; }

  if (req.originalUrl.startsWith('/api')) return res.status(status).json({ success: false, message, details });
  return res.status(status).render('error', { code: status, message });
};
module.exports = { notFound, errorHandler };
