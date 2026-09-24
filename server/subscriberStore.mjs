// Where collected addresses live. Two backends behind one API: Postgres when
// DATABASE_URL is set (the only option on a read-only serverless host), and the
// original JSON-lines file otherwise, so local runs need no database.
//
// Callers never branch on which one is active — subscribeHandler.mjs and
// emailsExport.mjs just ask for the list.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isDatabaseConfigured, ensureSchema, sql } from './db.mjs';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'emails.jsonl');

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, '');
  }
}

async function readFileRows() {
  let content;
  try {
    content = await fs.readFile(DATA_FILE, 'utf8');
  } catch {
    return [];
  }
  return content
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
}

/** True if the address is already on the list. */
export async function hasSubscriber(email) {
  if (isDatabaseConfigured()) {
    await ensureSchema();
    const rows = await sql`select 1 from subscribers where email = ${email}`;
    return rows.length > 0;
  }
  return (await readFileRows()).some((row) => row.email === email);
}

/** Adds the address. Idempotent by email — a repeat submit is not an error. */
export async function addSubscriber(email) {
  if (isDatabaseConfigured()) {
    await ensureSchema();
    // The primary key does the deduplicating, so this is atomic where the
    // file's read-then-append was not.
    await sql`insert into subscribers (email) values (${email}) on conflict (email) do nothing`;
    return;
  }

  await ensureDataFile();
  if (await hasSubscriber(email)) return;
  const entry = { email, subscribedAt: new Date().toISOString() };
  await fs.appendFile(DATA_FILE, `${JSON.stringify(entry)}\n`);
}

/** Every subscriber, oldest first, as { email, subscribedAt } with an ISO date. */
export async function listSubscribers() {
  if (isDatabaseConfigured()) {
    await ensureSchema();
    const rows = await sql`select email, subscribed_at from subscribers order by subscribed_at`;
    return rows.map((row) => ({
      email: row.email,
      subscribedAt: new Date(row.subscribed_at).toISOString(),
    }));
  }
  return readFileRows();
}
