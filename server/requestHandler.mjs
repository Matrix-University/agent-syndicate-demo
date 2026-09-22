// Reads a request body, delegates to the verification flow, and writes the JSON
// response. Shared by the Vite dev middleware and the standalone production server.
import { startVerification, completeVerification } from './subscribeHandler.mjs';
import { createSessionCookie, readSessionEmail } from './session.mjs';

const MAX_BODY_BYTES = 10_000; // an email + code is a few dozen bytes; this is generous

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error('Request body too large.'));
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

async function respondWith(res, work) {
  res.setHeader('Content-Type', 'application/json');
  try {
    const result = await work();
    res.statusCode = result.status;
    res.end(JSON.stringify(result.body));
  } catch {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Invalid request.' }));
  }
}

function methodNotAllowed(res) {
  res.statusCode = 405;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'Method not allowed.' }));
}

export function handleStartVerificationRequest(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res);
  respondWith(res, async () => {
    const { email } = await readJsonBody(req);
    return startVerification(email);
  });
}

export function handleCompleteVerificationRequest(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res);
  respondWith(res, async () => {
    const { email, code } = await readJsonBody(req);
    const result = await completeVerification(email, code);
    if (result.status === 201) res.setHeader('Set-Cookie', createSessionCookie(email.trim().toLowerCase()));
    return result;
  });
}

/** Lets the client skip the email gate if a valid session cookie is already present. */
export function handleSessionCheckRequest(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res);
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = 200;
  res.end(JSON.stringify({ email: readSessionEmail(req) }));
}

