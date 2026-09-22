// In-memory store for pending email verification codes. Codes are short-lived,
// so losing them on a server restart just means the player requests a new one.
const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_ATTEMPTS = 5;

const pending = new Map(); // email -> { code, expiresAt, attempts, lastSentAt }

export function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** Throws with a user-facing message if a resend was requested too soon. */
export function recordSend(email, code) {
  const existing = pending.get(email);
  if (existing && Date.now() - existing.lastSentAt < RESEND_COOLDOWN_MS) {
    const waitSeconds = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - existing.lastSentAt)) / 1000);
    throw new Error(`Wait ${waitSeconds}s before requesting another code.`);
  }
  pending.set(email, {
    code,
    expiresAt: Date.now() + CODE_TTL_MS,
    attempts: 0,
    lastSentAt: Date.now(),
  });
}

/** Returns { ok: true } or { ok: false, error } — never throws. */
export function checkCode(email, submittedCode) {
  const entry = pending.get(email);
  if (!entry) return { ok: false, error: 'Request a new code first.' };
  if (Date.now() > entry.expiresAt) {
    pending.delete(email);
    return { ok: false, error: 'That code expired. Request a new one.' };
  }
  if (entry.attempts >= MAX_ATTEMPTS) {
    pending.delete(email);
    return { ok: false, error: 'Too many attempts. Request a new code.' };
  }

  entry.attempts += 1;
  if (entry.code !== submittedCode) {
    return { ok: false, error: 'Incorrect code.' };
  }

  pending.delete(email);
  return { ok: true };
}
