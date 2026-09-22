// Converts data/emails.jsonl into a CSV for the admin dashboard's download button.
import { promises as fs } from 'node:fs';
import path from 'node:path';

const DATA_FILE = path.resolve(process.cwd(), 'data', 'emails.jsonl');

function csvEscape(value) {
  const str = String(value ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export async function buildEmailsCsv() {
  let content;
  try {
    content = await fs.readFile(DATA_FILE, 'utf8');
  } catch {
    content = '';
  }

  const rows = content
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const lines = rows.map((row) => `${csvEscape(row.email)},${csvEscape(row.subscribedAt)}`);
  return `${['email', 'subscribedAt'].join(',')}\n${lines.join('\n')}\n`;
}
