import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Game } from '../src/Game.js';
import { RemoteScores } from '../src/RemoteScores.js';

const cwd = process.cwd();
const databaseUrl = process.env.DATABASE_URL;
const originalFetch = globalThis.fetch;
const scratch = await mkdtemp(path.join(os.tmpdir(), 'agent-score-subtitles-'));

try {
  // The real handler/store run against a throwaway file, never a configured DB.
  process.chdir(scratch);
  delete process.env.DATABASE_URL;
  await mkdir('data');
  await writeFile(path.join('data', 'scores.jsonl'), JSON.stringify({
    handle: 'legacyName', kills: 2, seconds: 20, email: 'player@example.test',
  }) + '\n');
  const { handleScoresRequest } = await import('../server/scoreHandlers.mjs');
  const request = async (method, body) => {
    const res = {
      statusCode: 200, body: null,
      setHeader() {},
      end(value) { this.body = JSON.parse(value); },
    };
    await handleScoresRequest({ method, body, headers: {} }, res);
    return res;
  };
  globalThis.fetch = async (_url, options) => {
    const res = await request(options.method, options.body ? JSON.parse(options.body) : undefined);
    return { ok: res.statusCode < 400, status: res.statusCode, json: async () => res.body };
  };

  const remote = new RemoteScores();
  assert.equal(await remote.load(), true);
  assert.equal(remote.best.handle, 'legacyName');
  assert.equal(remote.best.usedCheat, false, 'missing metadata defaults to no subtitle');
  const result = await remote.submit({ handle: 'neoRunner', kills: 12, seconds: 60, usedCheat: true });
  assert.equal(result.rank, 1);
  assert.equal(result.scores[0].handle, 'neoRunner');
  assert.equal(result.scores[0].usedCheat, true);
  const stored = (await readFile(path.join('data', 'scores.jsonl'), 'utf8'))
    .trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(stored[1].handle, 'neoRunner');
  assert.equal(stored[1].usedCheat, true);
  const reloaded = new RemoteScores();
  await reloaded.load();
  assert.equal(reloaded.best.usedCheat, true, 'remote reload preserves the subtitle');
  const publicBoard = await request('GET');
  assert.ok(publicBoard.body.scores.every((row) => !('email' in row)));
  for (const usedCheat of ['true', 'false', 1, 0, null, {}]) {
    const rejected = await request('POST', { handle: 'invalidFlag', kills: 10, seconds: 50, usedCheat });
    assert.equal(rejected.statusCode, 400);
    assert.equal(rejected.body.error, 'Invalid score.');
  }
  const ordinary = await request('POST', { handle: 'POTENTIAL', kills: 3, seconds: 30 });
  const ordinaryEntry = ordinary.body.scores.find((row) => row.handle === 'POTENTIAL');
  assert.equal(ordinaryEntry.usedCheat, false, 'a literal handle never implies cheat use');
  console.log('PASS: API, file storage, remote round trip, legacy rows, validation and privacy');

  const game = Object.assign(Object.create(Game.prototype), {
    highScoreTable: { innerHTML: '' }, gameOverBoardLabel: {},
  });
  for (const global of [false, true]) {
    game._renderBoard([
      { handle: 'neoRunner', kills: 12, seconds: 60, usedCheat: true },
      { handle: 'POTENTIAL', kills: 3, seconds: 30, usedCheat: false },
      { handle: '<script>', kills: 2, seconds: 40, usedCheat: true },
      { handle: '', kills: 1, seconds: 50, usedCheat: true },
    ], 0, global);
    const html = game.highScoreTable.innerHTML;
    assert.ok(html.includes('neoRunner<span class="score-subtitle">POTENTIAL</span>'));
    assert.ok(html.includes('<span class="score-name">POTENTIAL</span>'));
    assert.ok(html.includes('&lt;script&gt;<span class="score-subtitle">'));
    assert.ok(html.includes('ANON<span class="score-subtitle">POTENTIAL</span>'));
    assert.equal((html.match(/class="score-subtitle"/g) ?? []).length, 3);
    assert.equal((html.match(/<li /g) ?? []).length, 9);
  }
  console.log('PASS: local/global subtitle rendering, ordinary rows, anonymous names and escaping');
} finally {
  globalThis.fetch = originalFetch;
  process.chdir(cwd);
  if (databaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = databaseUrl;
  await rm(scratch, { recursive: true, force: true });
}
