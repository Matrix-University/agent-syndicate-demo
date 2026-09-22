// SMTP transport for verification emails. Configured entirely via env vars so the
// site owner points it at their own mail server — no 3rd-party email API/account.
// See docs/postfix-security.md before changing this file or the relay's config.
import nodemailer from 'nodemailer';

let transporter;

// Defense-in-depth against header injection, on top of the email/code format
// checks already done in subscribeHandler.mjs (docs/postfix-security.md #9).
const HEADER_INJECTION_RE = /[\r\n]/;

function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_TLS_REJECT_UNAUTHORIZED } = process.env;
  if (!SMTP_HOST) {
    throw new Error(
      'SMTP_HOST is not set. Configure SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS in .env — see .env.example.'
    );
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: SMTP_SECURE === 'true',
    // Auth is optional — some self-hosted relays allow unauthenticated local submission.
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    // Fix the relay's certificate instead of disabling this (docs/postfix-security.md #7).
    tls: { rejectUnauthorized: SMTP_TLS_REJECT_UNAUTHORIZED !== 'false' },
  });
  return transporter;
}

export async function sendVerificationEmail(email, code) {
  if (HEADER_INJECTION_RE.test(email) || HEADER_INJECTION_RE.test(code)) {
    throw new Error('Invalid characters in email or code.');
  }

  // Opt-in only, for local testing without a real relay — never silently
  // enabled, so a misconfigured production deploy still fails loudly.
  if (!process.env.SMTP_HOST && process.env.SMTP_CONSOLE_FALLBACK === 'true') {
    console.log(`[dev] Verification code for ${email}: ${code} (no SMTP_HOST set, not actually sent)`);
    return;
  }

  const from = process.env.SMTP_FROM || 'Agent Syndicate <no-reply@agent-syndicate.local>';
  await getTransporter().sendMail({
    from,
    to: email,
    subject: `${code} is your Agent Syndicate verification code`,
    text: `Your verification code is ${code}. It expires in 10 minutes.`,
    html: `<p>Your verification code is <strong style="font-size:1.2em">${code}</strong>.</p><p>It expires in 10 minutes.</p>`,
  });
  // Never log the code itself — only that a send happened (docs/postfix-security.md #8).
  console.log('Verification email sent to', email);
}

