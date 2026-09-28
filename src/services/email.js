const nodemailer = require('nodemailer');
const env = require('../config/env');

const transporter = env.SMTP_HOST ? nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
}) : null;

async function sendPasswordReset(to, link) {
  if (!transporter || !env.SMTP_FROM) throw new Error('SMTP is not configured');
  const safeLink = link.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  await transporter.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: `${env.APP_NAME} password reset`,
    text: `Reset your password using this link. It expires in 5 minutes: ${link}`,
    html: `<p>Use this link to reset your password. It expires in 5 minutes.</p><p><a href="${safeLink}">Reset password</a></p>`,
  });
}

module.exports = { isConfigured: !!transporter && !!env.SMTP_FROM, sendPasswordReset };