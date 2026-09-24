// Converts the collected addresses into a CSV for the admin dashboard's
// download button. The rows come from subscriberStore.mjs, so this works the
// same against Postgres and the local JSON-lines file.
import { listSubscribers } from './subscriberStore.mjs';

function csvEscape(value) {
  const str = String(value ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export async function buildEmailsCsv() {
  const rows = await listSubscribers();
  const lines = rows.map((row) => `${csvEscape(row.email)},${csvEscape(row.subscribedAt)}`);
  return `${['email', 'subscribedAt'].join(',')}\n${lines.join('\n')}\n`;
}
