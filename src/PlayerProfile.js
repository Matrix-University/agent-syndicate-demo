// The player's handle and the cabinet's high score table, kept in localStorage:
// the email gate defaults to level 0 and a static deploy has no API at all, so
// the demo has to remember these with no server behind it.
const HANDLE_KEY = 'agent-syndicate:handle';
const SCORES_KEY = 'agent-syndicate:high-scores';
const BEST_KEY = 'agent-syndicate:best-run'; // pre-table single record, migrated on load
// The handle is also mirrored into a year-long cookie: some browsers and
// embedded webviews drop localStorage between sessions, and a handle is set
// once and rarely changed, so it shouldn't be asked for again when that happens.
const HANDLE_COOKIE = 'agent_syndicate_handle';
const HANDLE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const HANDLE_MAX_LENGTH = 14;
export const HANDLE_MIN_LENGTH = 2;
// Nine slots on the board, like the ranked table an arcade cabinet posts on its
// attract screen. Kept in step with BOARD_SIZE in server/scoreStore.mjs.
export const HIGH_SCORE_SLOTS = 9;

const ORDINALS = ['1ST', '2ND', '3RD'];

/** 0-based table index to its arcade label (4th onward are all -TH). */
export function ordinal(index) {
  return ORDINALS[index] ?? `${index + 1}TH`;
}

// Leetspeak alphabet plus the bracket glyphs handles get dressed up with.
const DISALLOWED = /[^A-Z0-9_\-.[\]|^<>+*]/g;
const LEET = { A: '4', B: '8', E: '3', G: '6', I: '1', O: '0', S: '5', T: '7', Z: '2' };

const HANDLE_STEMS = ['NEO', 'GHOST', 'CIPHER', 'RAZOR', 'VIRUS', 'STATIC', 'KERNEL', 'ZERO'];
const HANDLE_TAILS = ['RUNNER', 'BYTE', 'WIRE', 'PHREAK', 'DAEMON', 'CRASH', 'NULL', 'ROOT'];

/** Uppercases, drops anything outside the handle alphabet, and trims to length. */
export function sanitizeHandle(raw) {
  return String(raw ?? '')
    .toUpperCase()
    .replace(DISALLOWED, '')
    .slice(0, HANDLE_MAX_LENGTH);
}

/** Rewrites a sanitized handle in leetspeak — the "make it hacker" button. */
export function leetify(raw) {
  return sanitizeHandle(raw).replace(/[ABEGIOSTZ]/g, (letter) => LEET[letter]);
}

export function suggestHandle() {
  const stem = HANDLE_STEMS[Math.floor(Math.random() * HANDLE_STEMS.length)];
  const tail = HANDLE_TAILS[Math.floor(Math.random() * HANDLE_TAILS.length)];
  return leetify(`${stem}${tail}`);
}

/** M:SS — runs are minutes long, so an hours field would only ever read 0. */
export function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Board order: most agents killed first, shortest session breaking a tie.
 * Negative when `a` outranks `b`, so it sorts the table directly.
 */
export function compareRuns(a, b) {
  if (a.kills !== b.kills) return b.kills - a.kills;
  return a.seconds - b.seconds;
}

/** True when a live or finished run would sit above `entry` on the board. */
export function outranks(run, entry) {
  return !entry || compareRuns(run, entry) < 0;
}

function readStored(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // private browsing / storage disabled — profile just won't persist
  }
}

function writeStored(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Non-fatal: the in-memory profile still drives this session's HUD.
  }
}

function readCookie(name) {
  try {
    const pair = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
    return pair ? decodeURIComponent(pair.slice(name.length + 1)) : null;
  } catch {
    return null; // no document (server import) or cookies blocked
  }
}

function writeCookie(name, value, maxAge) {
  try {
    document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/; SameSite=Lax`;
  } catch {
    // Non-fatal, same as writeStored.
  }
}

function toEntry(raw) {
  if (!Number.isFinite(raw?.kills) || !Number.isFinite(raw?.seconds)) return null;
  return {
    kills: Math.max(0, Math.floor(raw.kills)),
    seconds: Math.max(0, raw.seconds),
    handle: sanitizeHandle(raw.handle),
  };
}

function parseStored(key) {
  const raw = readStored(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null; // corrupted entry — start the board over rather than throw
  }
}

/** The stored table, or one seeded from the single record kept before it existed. */
function readScores() {
  const stored = parseStored(SCORES_KEY);
  const rows = Array.isArray(stored) ? stored : [parseStored(BEST_KEY)];
  return rows
    .map(toEntry)
    .filter(Boolean)
    .sort(compareRuns)
    .slice(0, HIGH_SCORE_SLOTS);
}

export class PlayerProfile {
  constructor() {
    this.handle = sanitizeHandle(readStored(HANDLE_KEY) || readCookie(HANDLE_COOKIE));
    // Re-save so whichever store lost it gets it back, and the cookie's year restarts.
    if (this.handle) this._saveHandle();
    this.scores = readScores();
  }

  /** The score to beat — what the in-play HIGH SCORE readout shows. */
  get best() {
    return this.scores[0] ?? null;
  }

  setHandle(raw) {
    this.handle = sanitizeHandle(raw);
    this._saveHandle();
    return this.handle;
  }

  /**
   * Files a finished run. Returns { rank, entry } with a 1-based rank when it
   * made the board, or rank 0 when it didn't. A run without a kill never places
   * — otherwise dying instantly would post an unbeatable 0-in-0:00.
   */
  recordRun(kills, seconds) {
    if (kills < 1) return { rank: 0, entry: null };

    const entry = { kills, seconds: Math.round(seconds * 10) / 10, handle: this.handle };
    // A tie keeps the incumbent: on a real cabinet you have to beat the row, not match it.
    const above = this.scores.findIndex((row) => compareRuns(entry, row) < 0);
    const position = above === -1 ? this.scores.length : above;
    if (position >= HIGH_SCORE_SLOTS) return { rank: 0, entry: null };

    this.scores.splice(position, 0, entry);
    this.scores.length = Math.min(this.scores.length, HIGH_SCORE_SLOTS);
    this._saveScores();
    return { rank: position + 1, entry };
  }

  /** Names a row after the fact — the cabinet's "enter your initials" step. */
  nameEntry(entry, rawHandle) {
    entry.handle = this.setHandle(rawHandle);
    this._saveScores();
  }

  _saveHandle() {
    writeStored(HANDLE_KEY, this.handle);
    writeCookie(HANDLE_COOKIE, this.handle, HANDLE_COOKIE_MAX_AGE);
  }

  _saveScores() {
    writeStored(SCORES_KEY, JSON.stringify(this.scores));
  }
}
