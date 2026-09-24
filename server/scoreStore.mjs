// The shared high score board. Two backends behind one API, exactly like
// subscriberStore.mjs: Postgres when DATABASE_URL is set (the only option on a
// read-only serverless host), and a JSON-lines file otherwise, so local runs
// need no database. Callers never branch on which one is active.
//
// With neither available the client keeps its own board in localStorage — see
// src/RemoteScores.js. The shared board is an addition to that, not a
// replacement for it.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isDatabaseConfigured, ensureSchema, sql } from './db.mjs';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'scores.jsonl');

// Mirrors HIGH_SCORE_SLOTS in src/PlayerProfile.js — the two boards show the
// same number of rows, so a run that places on one reads the same on the other.
export const BOARD_SIZE = 9;

/** Board order: most agents first, shortest session breaking a tie, oldest first. */
function compareEntries(a, b) {
  if (a.kills !== b.kills) return b.kills - a.kills;
  if (a.seconds !== b.seconds) return a.seconds - b.seconds;
  return a.recordedAt.localeCompare(b.recordedAt);
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

/** The board, best first, at most `limit` rows. */
export async function listScores(limit = BOARD_SIZE) {
  if (isDatabaseConfigured()) {
    await ensureSchema();
    const rows = await sql`
      select handle, kills, seconds, recorded_at from high_scores
      order by kills desc, seconds asc, recorded_at asc
      limit ${limit}
    `;
    return rows.map((row) => ({
      handle: row.handle,
      kills: row.kills,
      seconds: Number(row.seconds),
      recordedAt: new Date(row.recorded_at).toISOString(),
    }));
  }
  // Projected to the same shape the SQL branch returns: the board is public, so
  // the session email recorded with a row must never leave the store.
  return (await readFileRows())
    .map((row) => ({
      handle: row.handle,
      kills: row.kills,
      seconds: row.seconds,
      recordedAt: row.recordedAt ?? '',
    }))
    .sort(compareEntries)
    .slice(0, limit);
}

/**
 * Files a run if it makes the board. Returns its 1-based rank, or 0 when the
 * board is full of better runs — which is also what keeps the table small:
 * once every slot is taken, only an improvement is ever written.
 *
 * A tie keeps the incumbent, the same rule the local board uses.
 */
export async function addScore(entry) {
  const board = await listScores(BOARD_SIZE);
  const candidate = { ...entry, recordedAt: new Date().toISOString() };
  const above = board.findIndex((row) => compareEntries(candidate, row) < 0);
  const position = above === -1 ? board.length : above;
  if (position >= BOARD_SIZE) return { rank: 0, scores: board };

  if (isDatabaseConfigured()) {
    await ensureSchema();
    await sql`
      insert into high_scores (handle, kills, seconds, email)
      values (${candidate.handle}, ${candidate.kills}, ${candidate.seconds}, ${candidate.email ?? null})
    `;
  } else {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.appendFile(DATA_FILE, `${JSON.stringify(candidate)}\n`);
  }

  return { rank: position + 1, scores: await listScores(BOARD_SIZE) };
}
