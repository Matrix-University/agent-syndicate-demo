import { defineConfig } from 'vite';
import { handleSubscribeRequest } from './server/requestHandler.mjs';

// Serves /api/subscribe during `npm run dev` so the email gate works locally
// without a separate process. Production uses server/index.mjs instead (see README).
function emailSubscribeDevMiddleware() {
  return {
    name: 'email-subscribe-dev-middleware',
    configureServer(server) {
      server.middlewares.use('/api/subscribe', handleSubscribeRequest);
    },
  };
}

export default defineConfig({
  server: { open: true },
  plugins: [emailSubscribeDevMiddleware()],
});
