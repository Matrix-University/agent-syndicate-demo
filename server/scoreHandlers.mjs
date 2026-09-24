// The shared leaderboard endpoint: GET /api/scores returns the board, POST files
// a finished run. Mounted by all three hosts (vite.config.js, server/index.mjs,
// api/[...path].js) like every other route here.
//
// Trust model, stated plainly: the browser reports its own kills and time, so a
// crafted POST can put anything on this board. The checks below are sanity
// bounds, not anti-cheat — a server-authoritative score would mean simulating
// the fight server-side, which this prototype does not do. Nothing here is used
// for anything but bragging rights.
import { listScores, addScore, BOARD_SIZE } from './scoreStore.mjs';
import { readSessionEmail } from './session.mjs';
import { readJsonBody } from './jsonBody.mjs';
// One definition of what a handle may contain, shared with the client. This
// module is pure — it touches localStorage only inside function bodies — so it
// imports cleanly under Node.
import { sanitizeHandle } from '../src/PlayerProfile.js';

const MAX_BODY_BYTES = 2_000;
const MAX_KILLS = 999;
const MAX_SECONDS = 60 * 60 * 6; // a six-hour run is already absurd
// The pack respawns on a timer and caps at seven alive, so even a perfect player
// cannot average a kill every half second. Below that, the run is not real.
const MIN_SECONDS_PER_KILL = 0.5;

function validate(body) {
  const kills = Number(body?.kills);
  const seconds = Number(body?.seconds);
  if (!Number.isInteger(kills) || kills < 1 || kills > MAX_KILLS) return null;
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > MAX_SECONDS) return null;
  if (seconds < kills * MIN_SECONDS_PER_KILL) return null;
  return {
    kills,
    seconds: Math.round(seconds * 10) / 10,
    handle: sanitizeHandle(body?.handle) || 'ANON',
  };
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export async function handleScoresRequest(req, res) {
  try {
    if (req.method === 'GET') {
      return sendJson(res, 200, { slots: BOARD_SIZE, scores: await listScores() });
    }

    if (req.method === 'POST') {
      const entry = validate(await readJsonBody(req, MAX_BODY_BYTES));
      if (!entry) return sendJson(res, 400, { error: 'Invalid score.' });
      // Attached when the email gate is on, so the owner can tie a board row to
      // a subscriber. Null otherwise — the board works with the gate off.
      entry.email = readSessionEmail(req);
      const { rank, scores } = await addScore(entry);
      return sendJson(res, rank > 0 ? 201 : 200, { rank, slots: BOARD_SIZE, scores });
    }

    return sendJson(res, 405, { error: 'Method not allowed.' });
  } catch (err) {
    console.error('Score request failed:', err);
    // The client keeps its local board either way, so a failure here is not fatal.
    return sendJson(res, 500, { error: 'Could not reach the leaderboard.' });
  }
}
