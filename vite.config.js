import { defineConfig } from 'vite';
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

export default defineConfig({
  server: { open: true },
  plugins: [emailSubscribeDevMiddleware()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        admin: 'admin.html',
      },
    },
  },
});
