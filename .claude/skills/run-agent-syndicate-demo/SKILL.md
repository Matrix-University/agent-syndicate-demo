---
name: run-agent-syndicate-demo
description: Build, run, screenshot, and play-test the Agent Syndicate Three.js brawler. Use when asked to run or start the game, take a screenshot of it, verify movement/camera/combat changes in the real app, or drive the player (move, punch, spawn agents) headlessly.
---

# Run Agent Syndicate

A Three.js + Vite browser game: one WebGL canvas, no DOM to click, driven entirely
by keyboard state (`e.code` in `src/Input.js`). So the agent path is **not** "open
localhost" — it's `driver.mjs`, which boots the Vite dev server in-process,
launches headless Chrome with SwiftShader, and speaks raw Chrome DevTools Protocol
over Node 22's built-in `WebSocket`. **No Playwright, Puppeteer, or chromium-cli
needed** — nothing to install beyond `npm install`.

All paths below are relative to the repo root. Verified on Windows 11 / Node
v22.20.0 / npm 11.6.1 with Chrome at
`C:\Program Files\Google\Chrome\Application\chrome.exe`.

## Prerequisites

`npm install` and a Chrome or Edge install. No `apt-get`, no browser download.

```bash
npm install
```

The driver finds the browser itself (Chrome → Edge → any Playwright chromium under
`~/AppData/Local/ms-playwright`). Override with `CHROME_BIN=/path/to/chrome.exe`.

## Run (agent path)

**Smoke test — launch, play, screenshot, assert.** Takes ~40 s.

```bash
node .claude/skills/run-agent-syndicate-demo/driver.mjs smoke
```

It boots the dev server on 127.0.0.1:5178, plays a real session, and checks:
geometry renders, the player spawns at the EXIT end facing the ramp, the camera
settles behind them, `W` drives them down the lane, an aimed punch damages an
agent, and dropping one to its last hit spawns a reinforcement. Exit code 0 = all passed.
Screenshots land in `.run-shots/` (`01-spawn` … `04-reinforced`) — **open them**,
a passing run with a black frame means the checks were too weak.

**Scripted session — drive whatever you need.** Commands come from a **file**
(not stdin, see Gotchas):

```bash
cat > /tmp/drive.txt <<'EOF'
# lines starting with # are ignored
state
hold KeyW 900
hold ShiftLeft 60
aim
engage 12
shot script-check
eval document.getElementById('objective').textContent
quit
EOF
node .claude/skills/run-agent-syndicate-demo/driver.mjs script /tmp/drive.txt
```

Commands: `state` · `aim` · `engage [tries]` · `hold <Code> <ms>` ·
`press <Code>` · `wait <ms>` · `shot <name>` · `eval <js>` · `nav [url]` ·
`viewport <w> <h> [touch]` (phone layouts; `touch` emulates a coarse pointer) · `quit`.
Key codes are the ones `Input.js` reads: `KeyW/A/S/D`, `KeyJ` (punch / throw the
carried car), `KeyE` (lift the car), `Space` (jump), `ShiftLeft` (sprint),
`KeyR` (retry), `KeyP` (pause), arrows.

`state` returns live engine values, which is how you verify a gameplay change
without eyeballing pixels:

```json
{"player":{"x":-27.5,"y":0,"z":51,"yawDeg":180},"camera":{"x":-27.5,"y":5.22,"z":54.41},
 "health":25,"enemiesAlive":5,"enemyHealthTotal":15,"totalSpawned":5,"dying":0,
 "nearestEnemy":4.5,"objective":"OBJECTIVE // SURVIVE CROWD (5 ACTIVE, 2 ATTACK SLOTS)",
 "enemyHealth":"5 ACTIVE / 0 DOWN","frames":9,"tris":23764}
```

`eval <js>` runs arbitrary JS in the page; `window.__game` is the live `Game`
(see Gotchas), so `eval window.__game.player.speedSprint` and friends work.

Add `--headed` to any invocation to watch it in a real window.

## Build

```bash
npm run build     # -> dist/, ~2 s
npm run preview   # serves the build on http://[::1]:4173/  (IPv6 loopback ONLY --
                  # curl http://127.0.0.1:4173 is refused)
```

The build is only for checking the bundle: `window.__game` is `DEV`-gated and
gets tree-shaken out, so `state`/`aim`/`engage` do **not** work against
`preview`. Drive the dev server.

## Run (human path)

`npm run dev` → Vite on :5173 and, because `vite.config.js` sets
`server.open: true`, **a real browser window pops open on the host**. Fine for a
human, wrong for an agent — the driver uses Vite's Node API with `open: false`
precisely to avoid that.

## Gotchas

- **`chrome --headless --screenshot` hangs forever.** The game's
  `setAnimationLoop` never goes idle, so `--virtual-time-budget` never expires.
  Every screenshot must come from a live CDP `Page.captureScreenshot`. This is
  the reason the driver exists.
- **Never pipe commands into the driver's stdin.** Draining `process.stdin` to
  EOF wedges the CDP socket: `Page.navigate` is sent, the reply never arrives,
  and node exits 0 having printed nothing. `script` mode reads a file for this
  reason. (Same trap in reverse: a `for await` over `readline` silently drops
  every command after the first when stdin is a heredoc.)
- **Do not add `--disable-gpu`.** It takes WebGL down with it and `ready()`
  throws `No WebGL context`. The working combination is
  `--use-angle=swiftshader --enable-unsafe-swiftshader`.
- **Chrome needs a throwaway `--user-data-dir`.** Without it, a running Chrome
  swallows the launch, the debugging port never opens, and the driver times out
  waiting for a page target.
- **The camera lerps in from world origin** over roughly the first second, so
  state read immediately after load shows it mid-flight (`camera.z` ~37 instead
  of ~53) and an early screenshot is framed wrong. The driver settles 1.5 s
  before its spawn assertions — do the same before any camera check.
- **A single punch almost never lands.** `_resolveOverlap` parks agents at
  `0.7 + 0.7 = 1.4 m`, just outside `CLOSE_RANGE_BONUS_RADIUS` (1.35 m), so the
  facing test always applies: the target must be within `facingDot >= 0.35`, and
  the player only re-aims **while moving**. Use `engage`, which walks into the
  cone and then swings; blind `press KeyJ` mashing fails at 2 m with full health.
- **SwiftShader runs ~20 fps**, so `frames` climbs slowly. Movement is
  `dt`-scaled and stays correct, but don't assert on frame counts.
- **Screenshots are 1280×720 including HUD** — `objective` and `enemyHealth` text
  is readable in them, which is often the fastest way to confirm game state.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Game never reached a rendering state within timeout` | `window.__game` is missing. Check `src/main.js` still has ``if (import.meta.env.DEV) window.__game = game;`` — the driver needs it. |
| `No WebGL context — SwiftShader flags missing?` | Something added `--disable-gpu`, or `CHROME_BIN` points at a browser too old for `--enable-unsafe-swiftshader`. |
| `Chrome never exposed a page target` | A stale `asd-cdp-*` profile lock in `%TEMP%`, or port 9333 taken. Set `ASD_CDP_PORT=9444`. |
| `Port 5178 is already in use` | A previous run left Vite up. `netstat -ano \| grep :5178` then `taskkill //F //PID <pid>`, or set `ASD_PORT=5179`. |
| Driver prints the chrome pid then exits silently, exit 0 | You piped into stdin. Use `script <file>`. |
| `npm run preview` up but `curl 127.0.0.1:4173` returns 000 | Preview binds `[::1]` only. Use `curl "http://[::1]:4173/"`. |
| `No Chrome found` | `CHROME_BIN='C:\Program Files\Google\Chrome\Application\chrome.exe'` |

## Test

There is no test runner in this repo. `driver.mjs smoke` **is** the regression
test. Asset-side checks: `npm run clips` regenerates the animation-catalog tables
from the GLBs.
