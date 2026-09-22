// Reads a request body, delegates to subscribeEmail, and writes the JSON response.
// Shared by the Vite dev middleware and the standalone production server.
import { subscribeEmail } from './subscribeHandler.mjs';

const MAX_BODY_BYTES = 10_000; // an email address is a few dozen bytes; this is generous

export function handleSubscribeRequest(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed.' }));
    return;
  }

  let body = '';
  let tooLarge = false;
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > MAX_BODY_BYTES) {
      tooLarge = true;
      req.destroy();
    }
  });
  req.on('end', async () => {
    if (tooLarge) return;
    res.setHeader('Content-Type', 'application/json');
    try {
      const { email } = JSON.parse(body || '{}');
      const result = await subscribeEmail(email);
      res.statusCode = result.status;
      res.end(JSON.stringify(result.body));
    } catch {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Invalid request.' }));
    }
  });
}
