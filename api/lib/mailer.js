const nodemailer = require('nodemailer');

// Shared SMTP transporter config - used by lib/healthCheck.js (ops alerts)
// and lib/emailOtp.js (user-facing OTP emails), so SMTP_* env vars are read
// in exactly one place.
function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

async function sendMail({ to, subject, text, html, from }) {
  const transporter = getTransporter();
  if (!transporter) {
    const err = new Error('email sending is not configured');
    err.status = 503;
    throw err;
  }
  const fromAddr = from || process.env.ALERT_EMAIL_FROM || process.env.SMTP_USER;
  await transporter.sendMail({ from: fromAddr, to, subject, text, html });
}

module.exports = { getTransporter, sendMail };
