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
import { handleScoresRequest } from '../server/scoreHandlers.mjs';
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
  '/api/scores': handleScoresRequest,
  '/api/admin/login': handleAdminLoginRequest,
  '/api/admin/logout': handleAdminLogoutRequest,
  '/api/admin/me': handleAdminMeRequest,
  '/api/admin/gate': handleAdminGateRequest,
  '/api/admin/emails.csv': handleAdminEmailsCsvRequest,
};

// Vercel matched `api/[...path].js` as a single-segment route, so /api/admin/*
// and /api/subscribe/* 404'd at the platform. vercel.json now rewrites /api/:path*
// here explicitly. A rewrite normally leaves req.url as the original path, but if
// the destination ever shows up instead, the catch-all's `path` param still has
// the real segments — so try req.url first, then rebuild from the param.
function resolve(req) {
  const fromUrl = req.url.split('?')[0].replace(/\/+$/, '');
  if (ROUTES[fromUrl]) return fromUrl;

  const param = req.query?.path;
  if (!param) return fromUrl;
  return `/api/${Array.isArray(param) ? param.join('/') : param}`.replace(/\/+$/, '');
}

export default function handler(req, res) {
  const route = ROUTES[resolve(req)];

  if (!route) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Not found.' }));
    return;
  }

  return route(req, res);
}
