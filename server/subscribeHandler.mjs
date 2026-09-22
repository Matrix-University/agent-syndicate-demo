// Email capture logic used by both the Vite dev middleware (vite.config.js) and
// the standalone production server (server/index.mjs), so the two never drift.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { sendVerificationEmail } from './mailer.mjs';
import { generateCode, recordSend, checkCode } from './verificationStore.mjs';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'emails.jsonl');

// Intentionally permissive (format only, no DNS/MX check) — this is a marketing
// opt-in gate, not an account system; rejecting too aggressively just loses signups.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const CODE_RE = /^\d{6}$/;

function normalizeEmail(rawEmail) {
  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
  return email && email.length <= MAX_EMAIL_LENGTH && EMAIL_RE.test(email) ? email : null;
}

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, '');
  }
}

async function alreadySubscribed(email) {
  let content;
  try {
    content = await fs.readFile(DATA_FILE, 'utf8');
  } catch {
    return false;
  }
  return content
    .split('\n')
    .filter(Boolean)
    .some((line) => {
      try {
        return JSON.parse(line).email === email;
      } catch {
        return false;
      }
    });
}

/**
 * Emails a 6-digit verification code to the address, unless already subscribed.
 * Returns { status, body } — never throws, so callers can respond directly.
 */
export async function startVerification(rawEmail) {
  const email = normalizeEmail(rawEmail);
  if (!email) return { status: 400, body: { error: 'Enter a valid email address.' } };

  await ensureDataFile();
  if (await alreadySubscribed(email)) {
    return { status: 200, body: { status: 'already-subscribed' } };
  }

  const code = generateCode();
  try {
    recordSend(email, code);
  } catch (err) {
    return { status: 429, body: { error: err.message } };
  }

  try {
    await sendVerificationEmail(email, code);
  } catch (err) {
    console.error('Failed to send verification email:', err);
    return { status: 502, body: { error: 'Could not send the verification email. Try again shortly.' } };
  }

  return { status: 200, body: { status: 'code-sent' } };
}

/**
 * Confirms a submitted code and, once correct, appends the email to the
 * JSON-lines data file. Returns { status, body } — never throws.
 */
export async function completeVerification(rawEmail, rawCode) {
  const email = normalizeEmail(rawEmail);
  const code = typeof rawCode === 'string' ? rawCode.trim() : '';
  if (!email || !CODE_RE.test(code)) {
    return { status: 400, body: { error: 'Enter the 6-digit code.' } };
  }

  const result = checkCode(email, code);
  if (!result.ok) return { status: 400, body: { error: result.error } };

  await ensureDataFile();
  if (!(await alreadySubscribed(email))) {
    const entry = { email, subscribedAt: new Date().toISOString() };
    await fs.appendFile(DATA_FILE, `${JSON.stringify(entry)}\n`);
  }
  return { status: 201, body: { status: 'subscribed' } };
}
