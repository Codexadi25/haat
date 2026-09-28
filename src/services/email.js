const nodemailer = require('nodemailer');
const env = require('../config/env');

const transporter = env.SMTP_HOST ? nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
}) : null;

const isConfigured = (!!transporter && !!env.SMTP_FROM) || (!!env.EMAILJS_SERVICE_ID && !!env.EMAILJS_TEMPLATE_ID && !!env.EMAILJS_PUBLIC_KEY);

async function sendPasswordReset(to, link) {
  if (!isConfigured) throw new Error('Email sending is not configured');

  if (env.EMAILJS_SERVICE_ID) {
    const payload = {
      service_id: env.EMAILJS_SERVICE_ID,
      template_id: env.EMAILJS_TEMPLATE_ID,
      user_id: env.EMAILJS_PUBLIC_KEY,
      accessToken: env.EMAILJS_PRIVATE_KEY,
      template_params: {
        to_email: to,
        reset_link: link,
        app_name: env.APP_NAME
      }
    };
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`EmailJS error: ${text}`);
    }
    return;
  }

  const safeLink = link.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  await transporter.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: `${env.APP_NAME} password reset`,
    text: `Reset your password using this link. It expires in 5 minutes: ${link}`,
    html: `<p>Use this link to reset your password. It expires in 5 minutes.</p><p><a href="${safeLink}">Reset password</a></p>`,
  });
}

module.exports = { isConfigured, sendPasswordReset };