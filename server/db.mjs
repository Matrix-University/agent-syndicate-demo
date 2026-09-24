// Postgres storage for hosts with no writable disk. Vercel runs the API as
// serverless functions whose filesystem is read-only, so the data/*.jsonl and
// data/settings.json paths the other modules use cannot work there.
//
// DATABASE_URL is injected by the Neon marketplace integration. When it is
// absent every caller falls back to its file path, so `npm run dev` and
// `npm start` still need zero setup. See docs/vercel-deployment.md.
import { neon } from '@neondatabase/serverless';

let client = null;
let schemaReady = null;

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

// Lazy: this module is imported on file-backed runs too, where building a
// client would throw on the missing URL.
function connection() {
  if (!client) client = neon(process.env.DATABASE_URL);
  return client;
}

/** Tagged template — `sql`select ... ${value}`` — parameterized, never interpolated. */
export function sql(strings, ...values) {
  return connection()(strings, ...values);
}

// The HTTP driver sends one statement per round trip, so the DDL is a list
// rather than one script. All of it is IF NOT EXISTS: every request path calls
// ensureSchema(), and a cold instance must be able to run it against a database
// that is already set up.
const SCHEMA = [
  `create table if not exists subscribers (
     email text primary key,
     subscribed_at timestamptz not null default now()
   )`,
  `create table if not exists settings (
     key text primary key,
     value jsonb not null
   )`,
  // Level 2's pending codes. In-process state would be wrong here: each request
  // can land on a different instance, so the one checking the code is not the
  // one that sent it. TTL, cooldown and attempt count all live in the row.
  `create table if not exists pending_verifications (
     email text primary key,
     code text not null,
     expires_at timestamptz not null,
     attempts integer not null default 0,
     last_sent_at timestamptz not null default now()
   )`,
];

/**
 * Creates the tables on first use. Cached as one promise so a warm instance
 * pays for it once; a failure clears the cache so the next request retries
 * rather than inheriting a rejected promise forever.
 */
export function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      for (const statement of SCHEMA) await connection().query(statement);
    })();
    schemaReady.catch(() => {
      schemaReady = null;
    });
  }
  return schemaReady;
}
