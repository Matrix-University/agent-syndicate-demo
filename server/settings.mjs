// Persisted, admin-toggleable settings — currently just whether the email gate
// is required to play. Postgres when DATABASE_URL is set (a serverless host has
// no writable disk), a JSON file otherwise, so local runs need no database.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isDatabaseConfigured, ensureSchema, sql } from './db.mjs';

const SETTINGS_FILE = path.resolve(process.cwd(), 'data', 'settings.json');
const GATE_KEY = 'emailGateEnabled';
// Defaults to on because EMAIL_GATE_LEVEL already decides whether there is a
// gate at all: at level 0 nothing consults this, so a fresh level 1/2 deploy
// should show the gate without the admin having to flip anything first. The
// toggle is an override for pausing collection without a rebuild.
const DEFAULTS = { emailGateEnabled: true };

async function readSettings() {
  try {
    const content = await fs.readFile(SETTINGS_FILE, 'utf8');
    return { ...DEFAULTS, ...JSON.parse(content) };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function isEmailGateEnabled() {
  if (isDatabaseConfigured()) {
    await ensureSchema();
    const [row] = await sql`select value from settings where key = ${GATE_KEY}`;
    return row ? Boolean(row.value) : DEFAULTS.emailGateEnabled;
  }
  return (await readSettings()).emailGateEnabled;
}

export async function setEmailGateEnabled(enabled) {
  const value = Boolean(enabled);

  if (isDatabaseConfigured()) {
    await ensureSchema();
    // JSON.stringify so the jsonb column gets a bare `true`/`false` literal
    // rather than a quoted string.
    await sql`
      insert into settings (key, value) values (${GATE_KEY}, ${JSON.stringify(value)}::jsonb)
      on conflict (key) do update set value = excluded.value`;
    return value;
  }

  await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
  const settings = await readSettings();
  settings.emailGateEnabled = value;
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  return settings.emailGateEnabled;
}
