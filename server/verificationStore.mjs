// Short-lived email verification codes (level 2 only). Two backends: Postgres
// when DATABASE_URL is set, an in-process Map otherwise.
//
// The Map is correct for a single long-lived process and wrong for serverless —
// each request can land on a different instance, so the one checking the code
// would not be the one that sent it. Losing codes on a restart only costs the
// player a resend, which is why the single-process path never needed a store.
import { isDatabaseConfigured, ensureSchema, sql } from './db.mjs';

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_ATTEMPTS = 5;

const pending = new Map(); // email -> { code, expiresAt, attempts, lastSentAt }

export function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function cooldownError(msSinceLastSend) {
  const waitSeconds = Math.ceil((RESEND_COOLDOWN_MS - msSinceLastSend) / 1000);
  return new Error(`Wait ${waitSeconds}s before requesting another code.`);
}

/** Throws with a user-facing message if a resend was requested too soon. */
export async function recordSend(email, code) {
  if (isDatabaseConfigured()) {
    await ensureSchema();
    // Expired rows are dead weight; clearing them here keeps the table to the
    // handful of codes actually in flight without a scheduled job.
    await sql`delete from pending_verifications where expires_at < now()`;

    const [existing] = await sql`select last_sent_at from pending_verifications where email = ${email}`;
    if (existing) {
      const elapsed = Date.now() - new Date(existing.last_sent_at).getTime();
      if (elapsed < RESEND_COOLDOWN_MS) throw cooldownError(elapsed);
    }

    const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
    await sql`
      insert into pending_verifications (email, code, expires_at, attempts, last_sent_at)
      values (${email}, ${code}, ${expiresAt}, 0, now())
      on conflict (email) do update
        set code = excluded.code,
            expires_at = excluded.expires_at,
            attempts = 0,
            last_sent_at = now()`;
    return;
  }

  const existing = pending.get(email);
  if (existing) {
    const elapsed = Date.now() - existing.lastSentAt;
    if (elapsed < RESEND_COOLDOWN_MS) throw cooldownError(elapsed);
  }
  pending.set(email, {
    code,
    expiresAt: Date.now() + CODE_TTL_MS,
    attempts: 0,
    lastSentAt: Date.now(),
  });
}

/** Returns { ok: true } or { ok: false, error } — never throws. */
export async function checkCode(email, submittedCode) {
  if (isDatabaseConfigured()) {
    await ensureSchema();
    // Counting the attempt in the same statement that reads the row keeps a
    // burst of parallel guesses from each seeing the same attempts value.
    const [entry] = await sql`
      update pending_verifications set attempts = attempts + 1
      where email = ${email}
      returning code, expires_at, attempts`;
    if (!entry) return { ok: false, error: 'Request a new code first.' };

    const discard = () => sql`delete from pending_verifications where email = ${email}`;
    if (Date.now() > new Date(entry.expires_at).getTime()) {
      await discard();
      return { ok: false, error: 'That code expired. Request a new one.' };
    }
    // Already incremented, so the cutoff is one past the limit.
    if (entry.attempts > MAX_ATTEMPTS) {
      await discard();
      return { ok: false, error: 'Too many attempts. Request a new code.' };
    }
    if (entry.code !== submittedCode) return { ok: false, error: 'Incorrect code.' };

    await discard();
    return { ok: true };
  }

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
