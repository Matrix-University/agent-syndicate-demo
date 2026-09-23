// Persisted, admin-toggleable settings — currently just whether the email gate
// is required to play. Stored as JSON so it survives a server restart.
import { promises as fs } from 'node:fs';
import path from 'node:path';

const SETTINGS_FILE = path.resolve(process.cwd(), 'data', 'settings.json');
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
  return (await readSettings()).emailGateEnabled;
}

export async function setEmailGateEnabled(enabled) {
  await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
  const settings = await readSettings();
  settings.emailGateEnabled = Boolean(enabled);
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  return settings.emailGateEnabled;
}
