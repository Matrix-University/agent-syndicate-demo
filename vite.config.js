import { defineConfig } from 'vite';
import { readGateLevel, GATE_OFF } from './server/gateLevel.mjs';
import { handleStartVerificationRequest, handleCompleteVerificationRequest, handleSessionCheckRequest } from './server/requestHandler.mjs';
import {
  handleAdminLoginRequest,
  handleAdminLogoutRequest,
  handleAdminMeRequest,
  handleAdminGateRequest,
  handleAdminEmailsCsvRequest,
  handleGateStatusRequest,
} from './server/adminHandlers.mjs';

try {
  process.loadEnvFile(); // SMTP_*/SESSION_SECRET/ADMIN_PASSWORD vars for the dev middleware below (see .env.example)
} catch {
  // .env is optional — sending will fail with a clear error until it's created.
}

// Serves /api/subscribe/*, /api/session, and /api/admin/* during `npm run dev` so the
// email gate and admin dashboard work locally without a separate process.
// Production uses server/index.mjs instead (see README).
function emailSubscribeDevMiddleware() {
  return {
    name: 'email-subscribe-dev-middleware',
    configureServer(server) {
      server.middlewares.use('/api/subscribe/start', handleStartVerificationRequest);
      server.middlewares.use('/api/subscribe/verify', handleCompleteVerificationRequest);
      server.middlewares.use('/api/session', handleSessionCheckRequest);
      server.middlewares.use('/api/gate-status', handleGateStatusRequest);
      server.middlewares.use('/api/admin/login', handleAdminLoginRequest);
      server.middlewares.use('/api/admin/logout', handleAdminLogoutRequest);
      server.middlewares.use('/api/admin/me', handleAdminMeRequest);
      server.middlewares.use('/api/admin/gate', handleAdminGateRequest);
      server.middlewares.use('/api/admin/emails.csv', handleAdminEmailsCsvRequest);
    },
  };
}

// EMAIL_GATE_LEVEL (see server/gateLevel.mjs) is read here as well as by the
// server so one setting drives both. Level 0 means no gate and no dashboard, so
// admin.html is left out of the build entirely — a 404 beats a login page whose
// POST no /api/admin/* route would answer. `npm run dev` always serves it.
const gateLevel = readGateLevel();

export default defineConfig({
  server: { open: true },
  plugins: [emailSubscribeDevMiddleware()],
  // Inlined so level 0 compiles the gate out rather than shipping dead code that
  // would call /api/* on a static deploy that has no server to answer.
  define: { __EMAIL_GATE_LEVEL__: JSON.stringify(gateLevel) },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        ...(gateLevel === GATE_OFF ? {} : { admin: 'admin.html' }),
      },
    },
  },
});
