// Signed, httpOnly session cookie so a returning player skips the email gate even
// if localStorage was cleared. Self-contained (HMAC-signed JSON), no session store.
import { createSignedCookie, readSignedCookie } from './signedCookie.mjs';
import crypto from 'node:crypto';

const COOKIE_NAME = 'agent_syndicate_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 180; // ~180 days

function getSecret() {
  const { SESSION_SECRET } = process.env;
  if (SESSION_SECRET) return SESSION_SECRET;
  // Falls back to a per-process secret so dev works with no setup; existing
  // sessions just won't survive a restart. Set SESSION_SECRET for real deployments.
  if (!getSecret.fallback) {
    getSecret.fallback = crypto.randomBytes(32).toString('hex');
    console.warn(
      'SESSION_SECRET is not set — using a random secret for this process (sessions won\'t survive a restart). Set SESSION_SECRET in .env for persistent logins.'
    );
  }
  return getSecret.fallback;
}

/** Builds the Set-Cookie header value for a verified email. */
export function createSessionCookie(email) {
  return createSignedCookie(COOKIE_NAME, { email, exp: Date.now() + SESSION_TTL_MS }, SESSION_TTL_MS, getSecret());
}

/** Reads and verifies the session cookie from a request, returning the email or null. */
export function readSessionEmail(req) {
  const payload = readSignedCookie(req, COOKIE_NAME, getSecret());
  if (!payload) return null;
  return typeof payload.email === 'string' && Date.now() <= payload.exp ? payload.email : null;
}

