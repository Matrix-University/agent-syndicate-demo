// Shared email-capture logic used by both the Vite dev middleware (vite.config.js)
// and the standalone production server (server/index.mjs), so the two never drift.
import { promises as fs } from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'emails.jsonl');

// Intentionally permissive (format only, no DNS/MX check) — this is a marketing
// opt-in gate, not an account system; rejecting too aggressively just loses signups.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

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
 * Validates and appends an email to the JSON-lines data file.
 * Returns { status, body } — never throws, so callers can respond directly.
 */
export async function subscribeEmail(rawEmail) {
  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
  if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) {
    return { status: 400, body: { error: 'Enter a valid email address.' } };
  }

  await ensureDataFile();
  if (await alreadySubscribed(email)) {
    return { status: 200, body: { status: 'already-subscribed' } };
  }

  const entry = { email, subscribedAt: new Date().toISOString() };
  await fs.appendFile(DATA_FILE, `${JSON.stringify(entry)}\n`);
  return { status: 201, body: { status: 'subscribed' } };
}
