// Vercel serverless function — sends email via SMTP using Nodemailer.
//
// Required environment variables (set in Vercel project settings):
//   SMTP_HOST  — e.g. smtp.gmail.com
//   SMTP_PORT  — e.g. 587
//   SMTP_USER  — your email address (also used as the "From" address)
//   SMTP_PASS  — your email password or app-specific password
//
// POST /api/send-email
// Body: { to, subject, body }

const nodemailer = require('nodemailer');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { to, subject, body } = req.body || {};
  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'Missing required fields: to, subject, body' });
  }

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return res.status(500).json({ error: 'Email service not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in Vercel environment variables.' });
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || '587'),
    secure: parseInt(SMTP_PORT || '587') === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  try {
    await transporter.sendMail({
      from: SMTP_USER,
      to,
      subject,
      text: body,
    });
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: 'Failed to send email', message: err.message });
  }
};
