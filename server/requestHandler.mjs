// Reads a request body, delegates to the verification flow, and writes the JSON
// response. Shared by the Vite dev middleware and the standalone production server.
import { startVerification, completeVerification } from './subscribeHandler.mjs';
import { createSessionCookie, readSessionEmail } from './session.mjs';
import { readJsonBody } from './jsonBody.mjs';

const MAX_BODY_BYTES = 10_000; // an email + code is a few dozen bytes; this is generous

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
    const { email } = await readJsonBody(req, MAX_BODY_BYTES);
    const result = await startVerification(email);
    // Level 1 subscribes on submit, so the session begins here rather than at
    // /verify. A 201 is the signal; level 2's 200 "code-sent" gets no cookie.
    if (result.status === 201) res.setHeader('Set-Cookie', createSessionCookie(email.trim().toLowerCase()));
    return result;
  });
}

export function handleCompleteVerificationRequest(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res);
  respondWith(res, async () => {
    const { email, code } = await readJsonBody(req, MAX_BODY_BYTES);
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

