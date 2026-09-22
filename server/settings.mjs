// Persisted, admin-toggleable settings — currently just whether the email gate
// is required to play. Stored as JSON so it survives a server restart.
import { promises as fs } from 'node:fs';
import path from 'node:path';

const SETTINGS_FILE = path.resolve(process.cwd(), 'data', 'settings.json');
const DEFAULTS = { emailGateEnabled: false };

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
