// Admin dashboard endpoints: login/logout, session check, email-gate toggle,
// and the CSV export. Shared by the Vite dev middleware and the production server.
import { checkAdminPassword, createAdminSessionCookie, clearAdminSessionCookie, isAdminRequest } from './adminAuth.mjs';
import { isEmailGateEnabled, setEmailGateEnabled } from './settings.mjs';
import { readGateLevel, GATE_OFF } from './gateLevel.mjs';
import { buildEmailsCsv } from './emailsExport.mjs';
import { readJsonBody } from './jsonBody.mjs';

const MAX_BODY_BYTES = 1_000;

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function requireAdmin(req, res) {
  if (isAdminRequest(req)) return true;
  sendJson(res, 401, { error: 'Not logged in.' });
  return false;
}

export async function handleAdminLoginRequest(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' });
  try {
    const { password } = await readJsonBody(req, MAX_BODY_BYTES);
    const result = checkAdminPassword(password);
    if (!result.ok) return sendJson(res, 401, { error: result.error });

    res.setHeader('Set-Cookie', createAdminSessionCookie());
    sendJson(res, 200, { status: 'logged-in' });
  } catch {
    sendJson(res, 400, { error: 'Invalid request.' });
  }
}

export function handleAdminLogoutRequest(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' });
  res.setHeader('Set-Cookie', clearAdminSessionCookie());
  sendJson(res, 200, { status: 'logged-out' });
}

export function handleAdminMeRequest(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed.' });
  sendJson(res, 200, { loggedIn: isAdminRequest(req) });
}

export async function handleAdminGateRequest(req, res) {
  if (req.method === 'GET') {
    if (!requireAdmin(req, res)) return;
    return sendJson(res, 200, { enabled: await isEmailGateEnabled(), level: readGateLevel() });
  }

  if (req.method === 'POST') {
    if (!requireAdmin(req, res)) return;
    try {
      const { enabled } = await readJsonBody(req, MAX_BODY_BYTES);
      return sendJson(res, 200, { enabled: await setEmailGateEnabled(enabled) });
    } catch {
      return sendJson(res, 400, { error: 'Invalid request.' });
    }
  }

  sendJson(res, 405, { error: 'Method not allowed.' });
}

export async function handleAdminEmailsCsvRequest(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed.' });
  if (!requireAdmin(req, res)) return;

  const csv = await buildEmailsCsv();
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="agent-syndicate-emails.csv"');
  res.end(csv);
}

/**
 * Public — tells the client whether to show the gate and, if so, which form to
 * render. The server's level is authoritative: the client is built with the same
 * value, but only what this reports matches what the endpoints will actually do.
 */
export async function handleGateStatusRequest(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed.' });
  const level = readGateLevel();
  // Level 0 wins over the stored toggle — there is no gate to enable.
  const enabled = level !== GATE_OFF && (await isEmailGateEnabled());
  sendJson(res, 200, { enabled, level });
}
