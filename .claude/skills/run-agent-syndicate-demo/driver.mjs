#!/usr/bin/env node
// CDP driver for the Agent Syndicate browser game.
//
// Why this exists: the app is a single WebGL canvas driven by keyboard state, so
// there is nothing in the DOM to click. This boots the Vite dev server in-process
// (Node API, so `server.open` can't spawn a real browser), launches headless
// Chrome with SwiftShader, and speaks raw Chrome DevTools Protocol over Node's
// built-in WebSocket — no Playwright/Puppeteer install required.
//
//   node .claude/skills/run-agent-syndicate-demo/driver.mjs smoke
//   node .claude/skills/run-agent-syndicate-demo/driver.mjs script commands.txt
//
// Screenshots land in .run-shots/ at the repo root.

import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import { mkdirSync, writeFileSync, existsSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const SKILL_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SKILL_DIR, '../../..');
const SHOT_DIR = path.join(REPO_ROOT, '.run-shots');
const CDP_PORT = Number(process.env.ASD_CDP_PORT || 9333);
const HTTP_PORT = Number(process.env.ASD_PORT || 5178);
const HEADED = process.argv.includes('--headed');

// Only the codes Input.js actually reads (it keys off e.code).
const KEYS = {
  KeyW: { key: 'w', vk: 87 }, KeyA: { key: 'a', vk: 65 },
  KeyS: { key: 's', vk: 83 }, KeyD: { key: 'd', vk: 68 },
  KeyJ: { key: 'j', vk: 74 }, KeyE: { key: 'e', vk: 69 },
  KeyR: { key: 'r', vk: 82 },
  Space: { key: ' ', vk: 32 },
  ShiftLeft: { key: 'Shift', vk: 16, modifiers: 8 },
  ArrowUp: { key: 'ArrowUp', vk: 38 }, ArrowDown: { key: 'ArrowDown', vk: 40 },
  ArrowLeft: { key: 'ArrowLeft', vk: 37 }, ArrowRight: { key: 'ArrowRight', vk: 39 },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ];
  // Playwright's bundled chromium, if some other project installed it.
  const pw = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright');
  if (existsSync(pw)) {
    for (const dir of readdirSync(pw).filter((d) => d.startsWith('chromium-'))) {
      candidates.push(path.join(pw, dir, 'chrome-win', 'chrome.exe'));
    }
  }
  const hit = candidates.find((c) => existsSync(c));
  if (!hit) throw new Error('No Chrome found. Set CHROME_BIN to a chrome.exe path.');
  return hit;
}

// --- CDP plumbing -----------------------------------------------------------

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      const slot = this.pending.get(msg.id);
      if (!slot) return; // an event, not a reply — we don't subscribe to any
      this.pending.delete(msg.id);
      if (msg.error) slot.reject(new Error(`${msg.error.message} (${msg.error.code})`));
      else slot.resolve(msg.result);
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`CDP timeout: ${method}`));
      }, 30000);
    });
  }

  // Returns the evaluated value, unwrapped. Throws on an in-page exception.
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    }
    return r.result.value;
  }
}

async function fetchJson(url, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error(`No response from ${url}`);
}

// --- session ----------------------------------------------------------------

class Session {
  async start() {
    mkdirSync(SHOT_DIR, { recursive: true });

    // Vite's Node API — `server.open: true` in vite.config.js would otherwise
    // pop a real browser window on the host every launch.
    this.vite = await createServer({
      root: REPO_ROOT,
      configFile: path.join(REPO_ROOT, 'vite.config.js'),
      server: { port: HTTP_PORT, strictPort: true, host: '127.0.0.1', open: false },
    });
    await this.vite.listen();
    this.url = `http://127.0.0.1:${HTTP_PORT}/`;
    console.error(`[driver] dev server ${this.url}`);

    // A throwaway profile: without it Chrome hands the URL to an already-running
    // instance and exits, and the debugging port never opens.
    this.profile = path.join(os.tmpdir(), `asd-cdp-${process.pid}`);
    const flags = [
      HEADED ? '--headless=false' : '--headless=new',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${this.profile}`,
      '--window-size=1280,720',
      // WebGL in headless: ANGLE over SwiftShader. Do NOT add --disable-gpu,
      // it takes the WebGL context down with it.
      '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--no-first-run', '--no-default-browser-check', '--disable-extensions',
      '--mute-audio', '--hide-scrollbars',
      'about:blank',
    ].filter((f) => f !== '--headless=false');

    this.chrome = spawn(findChrome(), flags, { stdio: 'ignore', detached: false });
    console.error('[driver] chrome pid', this.chrome.pid);

    const targets = await this.waitForPageTarget();
    this.cdp = await this.connect(targets.webSocketDebuggerUrl);
    await this.cdp.send('Page.enable');
    return this;
  }

  async waitForPageTarget() {
    for (let i = 0; i < 80; i += 1) {
      try {
        const list = await fetchJson(`http://127.0.0.1:${CDP_PORT}/json/list`, 1);
        const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (page) return page;
      } catch { /* keep polling */ }
      await sleep(250);
    }
    throw new Error('Chrome never exposed a page target on the debugging port');
  }

  connect(wsUrl) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      ws.addEventListener('open', () => resolve(new CDP(ws)));
      ws.addEventListener('error', (e) => reject(new Error(`CDP socket failed: ${e.message ?? e}`)));
    });
  }

  async nav(url = this.url) {
    await this.cdp.send('Page.navigate', { url });
    await this.ready();
  }

  // The game boots async (GLB + Draco decoder), so poll for the live handle.
  async ready(timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const state = await this.cdp.eval(`(() => {
        const c = document.getElementById('app');
        if (!c) return { stage: 'no-canvas' };
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        if (!gl) return { stage: 'no-webgl' };
        const g = window.__game;
        if (!g) return { stage: 'no-game-handle' };
        return { stage: 'ready', frames: g.renderer.info.render.frame,
                 tris: g.renderer.info.render.triangles };
      })()`);
      if (state.stage === 'ready' && state.frames > 2 && state.tris > 0) return state;
      if (state.stage === 'no-webgl') throw new Error('No WebGL context — SwiftShader flags missing?');
      await sleep(400);
    }
    throw new Error('Game never reached a rendering state within timeout');
  }

  async key(type, code) {
    const k = KEYS[code];
    if (!k) throw new Error(`Unmapped key code: ${code}`);
    await this.cdp.send('Input.dispatchKeyEvent', {
      type: type === 'down' ? 'keyDown' : 'keyUp',
      code, key: k.key, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk,
      modifiers: k.modifiers ?? 0,
    });
  }

  async hold(code, ms) {
    await this.key('down', code);
    await sleep(Number(ms));
    await this.key('up', code);
  }

  async press(code) {
    await this.key('down', code);
    await sleep(60);   // must span >= 1 frame or endFrame() eats the edge
    await this.key('up', code);
  }

  // Camera-relative bearing to the nearest live agent, in the same basis
  // Player.update builds its movement from (forward = camera dir flattened,
  // right = forward x up). mz/mx map straight onto W/S and D/A.
  aim() {
    return this.cdp.eval(`(() => {
      const g = window.__game;
      const alive = g.enemyManager.enemies.filter((e) => e.alive);
      if (!alive.length) return null;
      const p = g.player.root.position;
      let best = null, bestDist = Infinity;
      for (const e of alive) {
        const d = e.root.position.distanceTo(p);
        if (d < bestDist) { bestDist = d; best = e; }
      }
      const fwd = g.camera.position.clone();
      g.camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
      const up = g.camera.position.clone().set(0, 1, 0);
      const right = fwd.clone().cross(up).normalize();
      const dir = best.root.position.clone().sub(p); dir.y = 0; dir.normalize();
      const yaw = g.player.root.rotation.y;
      return {
        dist: Math.round(bestDist * 100) / 100,
        mz: dir.dot(fwd), mx: dir.dot(right),
        facingDot: dir.x * Math.sin(yaw) + dir.z * Math.cos(yaw),
      };
    })()`);
  }

  // Walk into the facing cone, then swing. CombatSystem needs facingDot >= 0.35
  // and the player only re-aims while it is actually moving.
  async engage(maxTries = 30) {
    const before = await this.state();
    for (let i = 0; i < maxTries; i += 1) {
      const a = await this.aim();
      if (!a) return { landed: false, reason: 'no live agents' };
      if (a.dist > 1.9 || a.facingDot < 0.75) {
        const keys = [];
        if (a.mz > 0.35) keys.push('KeyW'); else if (a.mz < -0.35) keys.push('KeyS');
        if (a.mx > 0.35) keys.push('KeyD'); else if (a.mx < -0.35) keys.push('KeyA');
        for (const k of keys) await this.key('down', k);
        await sleep(240);
        for (const k of keys) await this.key('up', k);
      }
      await this.press('KeyJ');
      await sleep(280);
      const now = await this.state();
      if (now.enemyHealthTotal < before.enemyHealthTotal) {
        return { landed: true, tries: i + 1, before: before.enemyHealthTotal, after: now.enemyHealthTotal };
      }
    }
    return { landed: false, tries: maxTries };
  }

  // Player/camera/enemy state via the DEV-only window.__game handle.
  state() {
    return this.cdp.eval(`(() => {
      const g = window.__game;
      const p = g.player.root.position, c = g.camera.position;
      const enemies = g.enemyManager.enemies;
      const round = (n) => Math.round(n * 100) / 100;
      return {
        player: { x: round(p.x), y: round(p.y), z: round(p.z),
                  yawDeg: Math.round(g.player.root.rotation.y * 180 / Math.PI) },
        camera: { x: round(c.x), y: round(c.y), z: round(c.z) },
        health: g.player.health,
        enemiesAlive: enemies.filter((e) => e.alive).length,
        enemyHealthTotal: enemies.reduce((sum, e) => sum + (e.alive ? e.health : 0), 0),
        totalSpawned: enemies.length,
        dying: enemies.filter((e) => !e.alive).length,
        nearestEnemy: round(Math.min(...enemies.filter((e) => e.alive)
          .map((e) => e.root.position.distanceTo(p)), Infinity)),
        objective: document.getElementById('objective').textContent,
        enemyHealth: document.getElementById('enemy-health-value').textContent,
        frames: g.renderer.info.render.frame,
        tris: g.renderer.info.render.triangles,
      };
    })()`);
  }

  async shot(name = 'shot') {
    const { data } = await this.cdp.send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(SHOT_DIR, `${name}.png`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    return file;
  }

  async stop() {
    try { this.chrome?.kill(); } catch { /* already gone */ }
    try { await this.vite?.close(); } catch { /* already gone */ }
    try { rmSync(this.profile, { recursive: true, force: true }); } catch { /* locked */ }
  }
}

// --- entry points -----------------------------------------------------------

async function smoke(s) {
  const fails = [];
  const check = (label, ok, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
    if (!ok) fails.push(label);
  };

  await s.nav();
  // The follow camera lerps in from world origin over roughly the first second;
  // read spawn state (and shoot) only after it has settled behind the player.
  await sleep(1500);
  const spawnState = await s.state();
  console.log('spawn   ', JSON.stringify(spawnState));
  check('renders geometry', spawnState.tris > 0, `${spawnState.tris} tris`);
  check('spawns at the EXIT end facing the ramp',
    spawnState.player.z > 35 && Math.abs(Math.abs(spawnState.player.yawDeg) - 180) < 5,
    `z=${spawnState.player.z} yaw=${spawnState.player.yawDeg}`);
  check('camera starts behind the player',
    spawnState.camera.z > spawnState.player.z, `cam.z=${spawnState.camera.z}`);
  console.log('shot    ', await s.shot('01-spawn'));

  await s.hold('KeyW', 1500);
  const moved = await s.state();
  console.log('after W ', JSON.stringify(moved));
  check('W drives the player toward the ramp',
    moved.player.z < spawnState.player.z - 2,
    `z ${spawnState.player.z} -> ${moved.player.z}`);
  console.log('shot    ', await s.shot('02-after-run'));

  const hit = await s.engage();
  const punched = await s.state();
  console.log('engage  ', JSON.stringify(hit));
  console.log('after J ', JSON.stringify(punched));
  check('frames keep advancing', punched.frames > moved.frames,
    `${moved.frames} -> ${punched.frames}`);
  check('enemies are alive and orbiting', punched.enemiesAlive > 0,
    `${punched.enemiesAlive} agents`);
  check('a punch lands and damages an agent', hit.landed,
    `enemy health ${moved.enemyHealthTotal} -> ${punched.enemyHealthTotal} in ${hit.tries} swings`);
  console.log('shot    ', await s.shot('03-after-punch'));

  // Roadmap item 4: dropping an agent to its last hit spawns a reinforcement,
  // and the kill bursts into green code. Agents have 3 HP, so this is 3 landed
  // swings plus whatever misses in between.
  let brawl = punched;
  for (let i = 0; i < 12 && brawl.totalSpawned === spawnState.totalSpawned; i += 1) {
    await s.engage(12);
    brawl = await s.state();
  }
  console.log('brawl   ', JSON.stringify(brawl));
  check('last-hit reinforcement spawns', brawl.totalSpawned > spawnState.totalSpawned,
    `${spawnState.totalSpawned} -> ${brawl.totalSpawned} agents spawned`);
  console.log('shot    ', await s.shot('04-reinforced'));

  console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nall checks passed');
  return fails.length === 0;
}

async function script(s) {
  // Commands come from a FILE, never stdin. Draining process.stdin to EOF here
  // wedges the CDP socket: Page.navigate is sent, the reply never arrives, and
  // the process exits 0 in silence. Read the script off disk and stdin stays shut.
  const file = process.argv[3];
  if (!file) throw new Error('script mode needs a file: driver.mjs script commands.txt');
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);

  await s.nav();
  console.log('ready. commands: nav | state | aim | engage [tries] | hold <Code> <ms> | press <Code> | shot <name> | eval <js> | quit');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [cmd, ...rest] = trimmed.split(/\s+/);
    console.log(`> ${trimmed}`);
    try {
      if (cmd === 'quit') break;
      else if (cmd === 'nav') await s.nav(rest[0]);
      else if (cmd === 'state') console.log(JSON.stringify(await s.state()));
      else if (cmd === 'aim') console.log(JSON.stringify(await s.aim()));
      else if (cmd === 'engage') console.log(JSON.stringify(await s.engage(Number(rest[0] ?? 30))));
      else if (cmd === 'hold') await s.hold(rest[0], rest[1] ?? 500);
      else if (cmd === 'press') await s.press(rest[0]);
      else if (cmd === 'wait') await sleep(Number(rest[0] ?? 500));
      else if (cmd === 'shot') console.log(await s.shot(rest[0] ?? 'shot'));
      else if (cmd === 'eval') console.log(JSON.stringify(await s.cdp.eval(rest.join(' '))));
      else console.log(`? unknown command: ${cmd}`);
    } catch (err) {
      console.log(`ERR ${err.message}`);
    }
  }
}

const mode = process.argv[2] ?? 'smoke';
const session = new Session();
let ok = true;
try {
  await session.start();
  if (mode === 'smoke') ok = await smoke(session);
  else if (mode === 'script') await script(session);
  else throw new Error(`Unknown mode: ${mode} (use smoke | script)`);
} catch (err) {
  console.error(`[driver] ${err.stack || err.message}`);
  ok = false;
} finally {
  await session.stop();
}
process.exit(ok ? 0 : 1);
