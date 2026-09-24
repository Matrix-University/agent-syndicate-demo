// Vercel entry point. Vercel serves dist/ as static files and runs this one
// function for everything under /api/, so the handlers in server/ stay the
// single implementation shared with the Vite dev middleware (vite.config.js)
// and the standalone server (server/index.mjs) — three hosts, one routing table.
//
// Env vars come from the Vercel project settings rather than .env; the storage
// modules pick Postgres over the local files as soon as DATABASE_URL is present.
// See docs/vercel-deployment.md.
import {
  handleStartVerificationRequest,
  handleCompleteVerificationRequest,
  handleSessionCheckRequest,
} from '../server/requestHandler.mjs';
import {
  handleAdminLoginRequest,
  handleAdminLogoutRequest,
  handleAdminMeRequest,
  handleAdminGateRequest,
  handleAdminEmailsCsvRequest,
  handleGateStatusRequest,
} from '../server/adminHandlers.mjs';

// Keep in step with the middleware list in vite.config.js.
const ROUTES = {
  '/api/subscribe/start': handleStartVerificationRequest,
  '/api/subscribe/verify': handleCompleteVerificationRequest,
  '/api/session': handleSessionCheckRequest,
  '/api/gate-status': handleGateStatusRequest,
  '/api/admin/login': handleAdminLoginRequest,
  '/api/admin/logout': handleAdminLogoutRequest,
  '/api/admin/me': handleAdminMeRequest,
  '/api/admin/gate': handleAdminGateRequest,
  '/api/admin/emails.csv': handleAdminEmailsCsvRequest,
};

export default function handler(req, res) {
  const pathname = req.url.split('?')[0].replace(/\/+$/, '');
  const route = ROUTES[pathname];

  if (!route) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Not found.' }));
    return;
  }

  return route(req, res);
}
