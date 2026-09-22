// Admin login for the dashboard (src/admin.js + admin.html): a single shared
// password from env, a signed session cookie, and a lockout after repeated
// failed attempts. In-memory lockout state — fine for a single-process deploy.
import crypto from 'node:crypto';
import { createSignedCookie, readSignedCookie, clearCookie } from './signedCookie.mjs';

const COOKIE_NAME = 'agent_syndicate_admin_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

let failedAttempts = 0;
let lockedUntil = 0;

function getSecret() {
  return process.env.SESSION_SECRET || null;
}

/** Checks a submitted password against ADMIN_PASSWORD with a timing-safe compare and a lockout. */
export function checkAdminPassword(password) {
  if (Date.now() < lockedUntil) {
    return { ok: false, error: 'Too many failed attempts. Try again later.' };
  }

  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return { ok: false, error: 'ADMIN_PASSWORD is not set — see .env.example.' };
  }

  const submitted = Buffer.from(String(password || ''));
  const expectedBuffer = Buffer.from(expected);
  const valid = submitted.length === expectedBuffer.length && crypto.timingSafeEqual(submitted, expectedBuffer);

  if (!valid) {
    failedAttempts += 1;
    if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
      lockedUntil = Date.now() + LOCKOUT_MS;
      failedAttempts = 0;
    }
    return { ok: false, error: 'Incorrect password.' };
  }

  failedAttempts = 0;
  return { ok: true };
}

export function createAdminSessionCookie() {
  const secret = getSecret();
  if (!secret) throw new Error('SESSION_SECRET must be set to use the admin dashboard — see .env.example.');
  return createSignedCookie(COOKIE_NAME, { admin: true, exp: Date.now() + SESSION_TTL_MS }, SESSION_TTL_MS, secret);
}

export function clearAdminSessionCookie() {
  return clearCookie(COOKIE_NAME);
}

export function isAdminRequest(req) {
  const secret = getSecret();
  if (!secret) return false;
  const payload = readSignedCookie(req, COOKIE_NAME, secret);
  return Boolean(payload && payload.admin === true && Date.now() <= payload.exp);
}
