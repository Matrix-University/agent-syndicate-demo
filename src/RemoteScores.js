// The shared leaderboard, served by /api/scores (server/scoreHandlers.mjs).
//
// Everything here is optional: a static deploy has no API to answer, and the
// server itself falls back to a local file when no database is configured. When
// this is unavailable the game shows PlayerProfile's localStorage board instead,
// so the leaderboard degrades rather than breaks.
const ENDPOINT = '/api/scores';
const TIMEOUT_MS = 6000;

function toEntry(raw) {
  if (!Number.isFinite(raw?.kills) || !Number.isFinite(raw?.seconds)) return null;
  return {
    kills: Math.max(0, Math.floor(raw.kills)),
    seconds: Math.max(0, raw.seconds),
    handle: typeof raw.handle === 'string' ? raw.handle : '',
  };
}

export class RemoteScores {
  constructor() {
    this.available = false;
    this.scores = [];
  }

  /** The global score to beat, or null when the board is empty/unreachable. */
  get best() {
    return this.scores[0] ?? null;
  }

  /** Fetches the board. Resolves to true when the leaderboard is live. */
  async load() {
    await this._request('GET');
    return this.available;
  }

  /**
   * Files a finished run. Resolves with { rank, scores } when the board
   * answered, or null when it didn't — the caller keeps its local board either
   * way, so this never throws.
   */
  async submit({ kills, seconds, handle }) {
    const data = await this._request('POST', { kills, seconds: Math.round(seconds * 10) / 10, handle });
    if (!data) return null;
    return { rank: Number.isFinite(data.rank) ? data.rank : 0, scores: this.scores };
  }

  async _request(method, body) {
    // A hung request would otherwise leave the game-over panel waiting on a
    // board that is never coming.
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(ENDPOINT, {
        method,
        signal: abort.signal,
        ...(body
          ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
          : {}),
      });
      if (!response.ok) throw new Error(`Leaderboard returned ${response.status}`);
      const data = await response.json();
      // A static host can answer any path with index.html, so trust the shape,
      // not the status code.
      if (!Array.isArray(data?.scores)) throw new Error('Leaderboard sent no board');
      this.scores = data.scores.map(toEntry).filter(Boolean);
      this.available = true;
      return data;
    } catch {
      this.available = false; // no API here, or it failed — the local board stands in
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
