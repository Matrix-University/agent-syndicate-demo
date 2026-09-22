// Generic signed-cookie helpers shared by the player session (session.mjs) and
// the admin session (adminAuth.mjs) — same HMAC scheme, different payloads/names.
// Extracted because both are the same crypto mechanism, not a coincidence.
import crypto from 'node:crypto';

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

export function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

/** Builds a Set-Cookie header value for a signed, httpOnly, SameSite=Lax cookie. */
export function createSignedCookie(name, payloadObject, ttlMs, secret) {
  const payload = Buffer.from(JSON.stringify(payloadObject)).toString('base64url');
  const token = `${payload}.${sign(payload, secret)}`;
  const secureAttr = process.env.NODE_ENV === 'production' ? ' Secure;' : '';
  return `${name}=${token}; Path=/; Max-Age=${Math.floor(ttlMs / 1000)}; HttpOnly; SameSite=Lax;${secureAttr}`;
}

/** Builds a Set-Cookie header value that immediately expires the named cookie. */
export function clearCookie(name) {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax;`;
}

/** Reads and verifies a signed cookie from a request, returning its payload or null. */
export function readSignedCookie(req, name, secret) {
  const token = parseCookies(req.headers.cookie)[name];
  if (!token) return null;

  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = sign(payload, secret);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}
