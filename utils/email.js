require('dotenv').config();
const nodemailer = require('nodemailer');

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const IS_DEV = !process.env.SMTP_PASS || process.env.SMTP_PASS === 'your_smtp_app_password';

// In development, log emails to console instead of sending them
const transporter = IS_DEV
  ? null
  : nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

async function sendMail({ to, subject, html }) {
  if (IS_DEV) {
    console.log('\n[EMAIL - DEV MODE] ─────────────────────────────');
    console.log(`To:      ${to}`);
    console.log(`Subject: ${subject}`);
    // Strip HTML tags for console readability
    console.log('Body:   ', html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    console.log('─────────────────────────────────────────────────\n');
    return;
  }
  await transporter.sendMail({
    from: `"AstroParks.io" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html,
  });
}

async function sendVerificationEmail(email, token) {
  const link = `${APP_URL}/api/auth/verify-email?token=${token}`;
  await sendMail({
    to: email,
    subject: 'Verify your AstroParks.io account',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;background:#0a1628;color:#e8f0fe;padding:32px;border-radius:12px;">
        <h1 style="color:#4f8ef7;margin-top:0;">★ AstroParks.io</h1>
        <h2>Confirm your email address</h2>
        <p>Thanks for signing up! Click the button below to verify your email and activate your account.</p>
        <a href="${link}" style="display:inline-block;background:#4f8ef7;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0;">
          Verify Email
        </a>
        <p style="font-size:12px;color:#7a9cc9;">This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.</p>
        <p style="font-size:12px;color:#7a9cc9;">Or copy this link: ${link}</p>
      </div>
    `,
  });
}

async function sendPasswordResetEmail(email, token) {
  const link = `${APP_URL}/reset-password.html?token=${token}`;
  await sendMail({
    to: email,
    subject: 'Reset your AstroParks.io password',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;background:#0a1628;color:#e8f0fe;padding:32px;border-radius:12px;">
        <h1 style="color:#4f8ef7;margin-top:0;">★ AstroParks.io</h1>
        <h2>Reset your password</h2>
        <p>We received a request to reset your password. Click the button below to choose a new one.</p>
        <a href="${link}" style="display:inline-block;background:#4f8ef7;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0;">
          Reset Password
        </a>
        <p style="font-size:12px;color:#7a9cc9;">This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>
        <p style="font-size:12px;color:#7a9cc9;">Or copy this link: ${link}</p>
      </div>
    `,
  });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
