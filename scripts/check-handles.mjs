import assert from 'node:assert/strict';
import {
  HANDLE_MAX_LENGTH, PlayerProfile, sanitizeHandle, leetify, suggestHandle,
} from '../src/PlayerProfile.js';

assert.equal(sanitizeHandle('cipherRunner'), 'cipherRunner');
assert.equal(sanitizeHandle('NEO_01'), 'NEO_01', 'existing uppercase handles stay unchanged');
assert.equal(sanitizeHandle(' a!B\tc\n@#$%?'), 'aBc', 'unsupported characters are still removed');
assert.equal(sanitizeHandle('_-.[ ]|^<>+*'), '_-.[]|^<>+*', 'allowed symbols stay unchanged');
assert.equal(sanitizeHandle('abcdefghijklmnop'), 'abcdefghijklmn');
assert.equal(sanitizeHandle(null), '');
assert.equal(sanitizeHandle(undefined), '');
assert.equal(leetify('ABEGIOSTZ'), '483610572');
assert.equal(leetify('abegiostz'), '483610572');
assert.equal(leetify('cipherRunner'), 'c1ph3rRunn3r');
assert.equal(leetify('CiPhErRuNnEr'), 'C1Ph3rRuNn3r');
assert.equal(leetify('c1ph3rRunn3r'), 'c1ph3rRunn3r', 'conversion is idempotent');
assert.equal(leetify('a!b@e#'), '483', 'conversion still sanitizes first');
assert.equal(leetify('abcdefghijklmnop').length, HANDLE_MAX_LENGTH);
for (let i = 0; i < 20; i += 1) {
  const suggested = suggestHandle();
  assert.equal(sanitizeHandle(suggested), suggested);
  assert.ok(suggested.length >= 2 && suggested.length <= HANDLE_MAX_LENGTH);
}
console.log('PASS: mixed-case sanitization, leet conversion, symbols, lengths, and suggestions');

const stored = new Map();
const cookies = new Map();
globalThis.localStorage = {
  getItem: (key) => stored.get(key) ?? null,
  setItem: (key, value) => stored.set(key, value),
};
globalThis.document = {
  get cookie() { return [...cookies].map(([key, value]) => `${key}=${value}`).join('; '); },
  set cookie(value) {
    const pair = value.split(';')[0];
    const equals = pair.indexOf('=');
    cookies.set(pair.slice(0, equals), pair.slice(equals + 1));
  },
};

try {
  const profile = new PlayerProfile();
  assert.equal(profile.setHandle('neoRunner'), 'neoRunner');
  assert.equal(stored.get('agent-syndicate:handle'), 'neoRunner');
  assert.equal(cookies.get('agent_syndicate_handle'), 'neoRunner');
  assert.equal(new PlayerProfile().handle, 'neoRunner', 'localStorage restores original case');
  stored.delete('agent-syndicate:handle');
  assert.equal(new PlayerProfile().handle, 'neoRunner', 'cookie fallback restores original case');

  const { entry, rank } = profile.recordRun(3, 10);
  assert.equal(rank, 1);
  assert.equal(entry.handle, 'neoRunner');
  assert.equal(new PlayerProfile().best.handle, 'neoRunner', 'saved board restores original case');
  profile.nameEntry(entry, leetify('cipherRunner'));
  assert.equal(new PlayerProfile().best.handle, 'c1ph3rRunn3r', 'renamed board retains leet letter case');
  assert.equal(profile.recordRun(3, 10).rank, 2, 'score ordering is unchanged');
  console.log('PASS: profile, cookie fallback, local leaderboard, and post-run naming preserve case');
} finally {
  delete globalThis.localStorage;
  delete globalThis.document;
}
