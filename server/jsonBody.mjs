// Reads a JSON request body. Shared by requestHandler.mjs and adminHandlers.mjs,
// which had the same reader with different size caps.
//
// Vercel's Node runtime parses the body before the handler runs and leaves the
// stream drained, so reading the stream there yields nothing. Preferring what
// the host already parsed keeps one code path working under the dev middleware,
// `npm start` and serverless alike.
export function readJsonBody(req, maxBytes) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      try {
        return Promise.resolve(JSON.parse(req.body || '{}'));
      } catch {
        return Promise.reject(new Error('Invalid JSON body.'));
      }
    }
    if (typeof req.body === 'object') return Promise.resolve(req.body);
  }

  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
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
