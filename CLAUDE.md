# CLAUDE.md — Agent Syndicate (Three.js)

Guidance for Claude Code working in this repo. A third-person brawler prototype on
**Three.js `^0.160`** + **Vite**, plain ES modules — no framework, no TypeScript,
no test runner. Keep changes in that idiom.

**Project goal — dual target:** a good **browser** game whose **3D assets are the
same files a Decentraland (SDK7) scene would load**. The Three.js _engine code_ will
not run in Decentraland (DCL scenes are SDK7 TypeScript), so the portable layer is
the **GLB assets**, not the runtime.

**Invariant — one asset, both targets:** the browser and DCL load the _same_ baked
character file, `public/models/agent-dcl.glb` (single GLB, embedded clips, Draco).
Preserve this — don't introduce a browser-only character asset or a separate
runtime animation file as the shipped path, and don't apply browser-only
optimizations (Meshopt, KTX2) to it (DCL can't read them). Any new shipped 3D asset
must clear the DCL constraints below so it stays loadable in both. See
[docs/decentraland-asset-compat.md](docs/decentraland-asset-compat.md) and
[docs/baking-animations.md](docs/baking-animations.md).

## Commands

- `npm install` — deps (`three`, `vite`).
- `npm run dev` — Vite dev server at `http://localhost:5173`.
- `npm run build` — static `dist/`. `npm run preview` — serve the build.
- No tests/linter configured. Verify by running the dev server and exercising
  movement (WASD/arrows, Shift to sprint).

## Architecture

```
index.html               canvas + HUD, loads src/main.js
src/main.js              boots the Game
src/Game.js              renderer, scene, camera, the update loop
src/World.js             lights, floor, grid, blockout pillars
src/LiftableCar.js       the one car the player can lift and throw
src/Player.js            character: rig, movement, animation state machine
src/AgentKit.js          the System Agents' look: shared, ref-counted suit/face/hair meshes
src/ThirdPersonCamera.js smooth follow camera
src/Input.js             keyboard state + movement axes
src/PlayerProfile.js     handle + personal best, in localStorage
src/HandleDialog.js      the "choose your handle" overlay
src/Radio.js             RFZAMP, the Winamp-style Radio Free Zion player (DOM audio + now-playing feed)
src/PauseMenu.js         the pause sheet (resume, handle, radio, controls legend, settings)
src/Settings.js          per-device preferences: left-handed controls, vibrate on hit
```

**Load-bearing design choice — do not break it:** `Player.root` is what moves
through the world and what the camera follows; `Player.rig` is the visible body.
Movement mutates `root`; visuals/animation mutate `rig`. This separation is what
lets you swap the placeholder primitives for a Mixamo model without touching the
movement code.

## The render loop (`Game.js`)

- A single loop via `renderer.setAnimationLoop(this._loop)`. Don't introduce
  competing `requestAnimationFrame` loops inside components — thread `dt` through
  `update(dt, …)` instead.
- Fixed update order: **simulate (`player.update`) → camera (`followCam.update`) →
  `renderer.render`**. Keep it.
- `dt = Math.min(this.clock.getDelta(), 0.05)` — the clamp prevents a
  backgrounded/paused tab from producing a huge `dt` that teleports the player.
  Preserve it.

## Three.js best practices to apply here

**Frame-rate independence.** All time-based motion takes `dt`. Never `x += speed`;
always `x += speed * dt`. For smoothing, use the exponential, frame-rate-independent
forms already in the code — not a fixed-alpha `lerp`:

- `current + diff * (1 - Math.exp(-k * dt))` — see `dampAngle` in `Player.js`.
- `a.lerp(b, 1 - Math.pow(base, dt))` — see `ThirdPersonCamera.update` and the
  limb ease-out in `_animate`.
  Wrap yaw differences into `[-π, π]` before damping (see `dampAngle`).

**No per-frame allocation.** Hot paths (`update`, `_animate`, camera `update`)
must not `new` anything. Reuse the preallocated scratch vectors
(`this._forward`, `this._right`, `this._move`, `this._up`, `this._desired`,
`this._look`) with `.copy()`, `.set()`, `.addScaledVector()`, `.crossVectors()`.
If you need a new temp vector for a per-frame method, add it as a field in the
constructor.

**Resource lifecycle.** Geometries, materials, textures, loaded GLTF scenes, and
render targets must be `.dispose()`d when discarded — removing from the scene
graph does not free GPU memory. Share geometry/materials across instances
(`limbGeo`, `pillarMat`) instead of allocating per mesh in a loop.

**Renderer/setup.** Keep `setPixelRatio(Math.min(devicePixelRatio, 2))`,
`shadowMap.type = PCFSoftShadowMap`, and the resize handler that updates both
`camera.aspect`/`updateProjectionMatrix()` and `renderer.setSize`. Keep the
directional light's shadow-camera frustum tight around the play area rather than
covering the whole 140×140 floor.

**Scene conventions.** Units ≈ meters, **Y up**, floor is a `PlaneGeometry`
rotated `-Math.PI/2`, player ≈ 3 units tall. New large meshes set `castShadow` /
`receiveShadow` intentionally. Movement basis comes from
`camera.getWorldDirection()` flattened to the ground — reuse that, don't hardcode
world axes. Prefer `THREE.MathUtils` helpers (`clamp`, `lerp`, `degToRad`).

**Visual style.** Matrix-green: emissive accents (`0x39ff14`), dark
`MeshStandardMaterial` with explicit `roughness`/`metalness`, green key light +
cool rim light, fog. Match it when adding world or character elements.

## Animation & gameplay states

**Separation of concerns:** `Player` (`src/Player.js`) owns movement, vertical
physics, and _intent_ (locomotion state, punch, jump, carry/throw);
`AnimationController` (`src/AnimationController.js`) owns all clip/mixer work.
Player calls `anim.setLocomotion(state, speedFactor)`, `anim.playAction('punch')`,
`anim.jumpTakeoff()` / `anim.jumpLand()`, `anim.update(dt)` — keep that boundary
(don't reach into the mixer from `Player`).

`Player` loads the single shared asset **`/models/agent-dcl.glb`** (configured in
`Game.js`: `modelUrl`, `modelScale`, `modelYaw`) via `GLTFLoader` + `DRACOLoader`
(decoder self-hosted in `public/draco/`) and hands its clips to an
`AnimationController`, which crossfades actions and runs the mixer each frame. This
is the **same file** uploaded to Decentraland (browser + DCL parity). If the GLB is
absent or fails to load, `Player` **falls back** to the primitive placeholder
animated procedurally in `_animate` (so the project always runs with zero assets) —
preserve that fallback. `Player` also accepts an optional `animationUrl` (same-rig
clip library bound by bone name) for development; production ships the single baked file.

In `AnimationController`: clips bind by case-insensitive substring match (`CLIP_NAMES`,
priority-ordered) with `CLIP_FALLBACK` covering missing clips. Override priority is
**airborne > action (punch) > landing (cancelable) > locomotion**. To add a move:
a **looping state** extends `STATE` + `CLIP_NAMES` (+ the `this.state =` line in
`Player.update`); a **one-shot** extends `ACTIONS` + an `Input` intent getter + an
`anim.playAction(...)` call. Either way add the clip to the `KEEP` set in
`scripts/bake-animations.mjs` and re-bake.

**Every clip is catalogued** in [docs/animation-catalog.md](docs/animation-catalog.md):
what ships, its authoring tier (pass-through / tweaked / authored), what it's bound
to, and the 35 clips still unused in `models-src/UAL2_Standard.glb`. Check it for an
existing clip before authoring a new move, and record any clip you add there.
`npm run clips` (`scripts/list-clips.mjs`) regenerates its tables from the GLBs.

**`Walk`, `Run`, the carry pair and the throw are authored by the bake, not shipped
by the library** — UAL2 has no neutral walk, no run, nothing that holds a load
_overhead_, and no two-handed throw; its only forward locomotion is
`Walk_Carry_Loop` (real legs, arms locked in a chest-height carry pose) and its only
throw is a one-armed grenade toss. Three recipe modules sit on the shared pose kit
`scripts/lib/pose.mjs`:

- `scripts/lib/locomotion.mjs` keeps the source's lower body and authors the upper
  body as `Walk`, then derives `Run` from it. Don't re-point `WALK` at the carry clip.
- `scripts/lib/carry.mjs` authors `Carry_Overhead_Loop` (over the same stride) and
  `Carry_Overhead_Idle` (over `Idle_No_Loop`'s stance) with the arms **raised** — a
  sign flip on `shoulderDrop` in `authorArms` — and the trunk leaned back under the load.
- `scripts/lib/throw.mjs` authors `Throw_Overhead`, the car heave, over one frozen
  frame of `Idle_No_Loop` (Player roots the character for the throw, so the feet
  don't travel). Unlike the other two it authors _motion_: `TRACKS` keys every arm
  and trunk value at five phases and splines them, and `authorArms`/`setHipPitch`
  take the per-frame result. `RELEASE` in that table **must** stay at
  `THROW_PROFILE.release / .duration` — it is the frame the car leaves the hands,
  and the arms are authored to reach full extension exactly there.

**The character is dressed in the bake, too.** `scripts/lib/outfit.mjs` turns the
mannequin into the player from `docs/image references/AGENT_HULK_SHEET.png`
(white two-button suit, black shirt, gold tie, belt, blond shoulder-length hair,
stubble, aviators) **on the mannequin's own body — don't reshape it**; a muscle-bulk
pass was tried and read lumpy. It splits the skinned mesh into region materials by
bone, then raycasts everything else on as thin skinned overlays, each vertex
weighted like the surface under it (shirt V, tie, lapels, buttons, pockets, seams,
face, pads, hair); only the aviators are rigid on `Head`. Mesh and materials only —
the skeleton and clips are untouched, and both targets get the look from the one GLB.

The agents (`src/AgentKit.js`) are procedural, after the BLACK/BROWN/BLONDE sheets.
Every `Enemy` shares one kit of geometry and materials (`AgentKit.acquire()` /
`release()`, freed with the last user) except its suit, which it clones because
the suit's emissive is that agent's hit flash. Keep new agent parts in the kit.

**The authored clips are additive — never overwrite a shipped clip to make room.**
`Walk_Carry_Loop` is both an authoring source _and_ a shipped clip (renamed
`Carry_Loop` via `RENAME`); it stays bound to `STATE.CARRY`, selected by nothing,
parked for a future carry-object state. That is why the overhead pair has its own
names. The carry stance also tips the pelvis ~33° _back_,
so the bake re-pitches the hips to a neutral read from `Idle_No_Loop` —
straightening the spine alone leaves the character walking on its heels. Tune via
the `WALK`/`RUN`/`CARRY` constants in those modules, re-bake, and check with
`node scripts/inspect-locomotion.mjs` (arm/leg correlation should be near −1.00).
`Throw_Overhead` is authored _to_ `THROW_PROFILE`, so it plays at `clipRate` 1;
check it with `node scripts/inspect-throw.mjs`, which reports it beside the parked
library `Throw` (hand asymmetry near 0 = two hands on the car; the old one-armed
clip scores 1.19m and reads as a punch). Beware `shoulderBias`: `authorArms`
documents negative as forward, which holds for an arm at the side but **inverts**
for a raised arm, so the throw's overhead keys use positive for forward.

`setLocomotion`'s `speedFactor` is ground speed over the speed that state's clip
was authored for — keep it per-state, or `Run` gets driven at the walk's rate. Shipped models go in `public/models/`;
bake **inputs** live in `models-src/`. `.dispose()` what you swap out (`disposeObject`,
`AnimationController.dispose()`).

## Decentraland compatibility (keep assets portable)

Browser and DCL ship the **same** GLB (the invariant above), not running Three.js
inside DCL. When creating or optimizing 3D assets, follow these so one file works in
both engines (full detail in [docs/decentraland-asset-compat.md](docs/decentraland-asset-compat.md)):

- **Format:** single-file **GLB (glTF 2.0)** with **animation clips embedded** in
  the file. Skeletal animation only. Browser **and** DCL load the same baked
  `public/models/agent-dcl.glb`, produced by **`npm run bake:anims:dcl`** from the
  sources in `models-src/` (see [docs/baking-animations.md](docs/baking-animations.md)).
  Don't hand-edit the generated `agent-dcl.glb`.
- **Clip names:** clean and stable (`Idle`, `Run`, `Attack`, …). DCL's `Animator`
  matches the exact clip name; our loader matches loosely (`CLIP_NAMES`), so
  consistent names satisfy both. Keep state name ↔ clip name aligned.
- **Compression:** DCL supports **Draco**, **not Meshopt**, and **not KTX2/Basis**
  textures. For anything that should stay DCL-portable, use **Draco (or
  uncompressed) + PNG/JPG**. Reserve Meshopt/KTX2 for browser-only assets, and if
  you keep both, export two profiles rather than one Meshopt file.
- **Budgets:** keep meshes **low-poly** and **share/atlas materials & textures** —
  DCL scenes cap triangles (`n×10,000`), entities (`n×200`), bodies (`n×300`),
  materials (`log2(n+1)×20`), textures (`log2(n+1)×10`) per `n` parcels, counting
  only rendered entities. Plan crowds with instancing/LOD to stay under budget.
- **Don't** assume engine portability: keep gameplay/render logic decoupled from
  asset definitions so a DCL SDK7 port can swap the runtime and keep the GLBs.
- **Avatar wearables/emotes are out of scope** for asset reuse — they require a
  re-rig to DCL's avatar armature (≤62 bones) and hard caps (emote ≤3,000 tris,
  ≤10 s/300 frames, single clip, ≤3 MB). Treat as a separate deliverable, not the
  in-game character files.

## Carrying and throwing

`LiftableCar` (`src/LiftableCar.js`) is the one prop the player can pick up — the
car in the bay `World` deliberately leaves empty by the entry ramp
(`LIFTABLE_CAR_SLOT`). It cycles `grounded → carried → flying → settling →
grounded`, and it **owns its own world collider**, registered through
`world.addCollider()` and flagged `disabled` while carried or airborne so the thing
you're holding isn't also a wall you walk into. `World.collide`/`groundHeight` skip
disabled colliders — preserve that.

Ownership is deliberately split, so keep it that way:

- **`Game`** resolves the pickup (it is the only object that knows about both the
  player and the car) and calls `player.startLift(car)`.
- **`Player`** knows only "a prop" with `lift(player)` / `launch(direction)`, plus
  an optional `throwPose(t)`. It owns the timing: rooted during the pickup and the
  throw, and it releases the prop partway through the throw clip
  (`THROW_PROFILE.release`), driving `throwPose` up to that point so the car tracks
  the hands instead of hanging still while the arms swing under it.
- **`LiftableCar`** owns its visuals, ballistics and collider; carrying reparents
  it to `player.root` via `attach()` (world transform preserved), throwing
  reparents it back to the scene.
- **`CombatSystem.resolveThrownProp`** applies impact damage, alongside the other
  hit resolution.

While carrying, the attack input **throws** instead of punching, so touch controls
need no extra button; jump and punch are unavailable until the car is gone.

## Handle, session and the high score board

`PlayerProfile` (`src/PlayerProfile.js`) owns the two things that outlive a run —
the player's handle and the `HIGH_SCORE_SLOTS`-row board — both in `localStorage`
(the handle mirrored into a year-long cookie, so a cleared store doesn't re-prompt),
because the gate defaults to level 0 and a static deploy has no API to persist them
to. `Game` owns the session clock (`sessionTime`, one life: spawn to death, reset by
`_restart`) and writes every readout; `HandleDialog` only reads and writes the
profile.

**Two boards, one shape.** `PlayerProfile` is the local one; `RemoteScores`
(`src/RemoteScores.js`) is the shared one behind `/api/scores`. The remote board
is used whenever it answers and the local one whenever it does not — a static
deploy with no API still has a working leaderboard, just a private one. `Game`
picks per render (`_boardBest`, and the `global` flag `_renderBoard` labels the
panel with), so the heading always matches the rows on screen. Both boards are
always written: the local one at `_endGame`, the shared one from
`_submitSession` once any name prompt has resolved.

Board order is **most agents killed, shortest session breaking a tie**
(`compareRuns`; `outranks` is the same test for a live run). Two rules make it
behave like a cabinet: a run with no kills never places, or dying instantly would
post an unbeatable 0-in-0:00; and a tie keeps the incumbent, so you have to beat a
row rather than match it. `recordRun` returns `{ rank, entry }` — `Game._endGame`
files the run, sets the rank banner and renders the board with that row flagged
`current`.

The arcade bar (`#arcade-bar`) is the 1UP/HIGH SCORE readout: `_updateRunHud`
writes it only when the displayed second or kill count changes, and swaps the
HIGH SCORE column to the live run (plus a `leading` blink) once it outranks the
top row. A run that places while the player has no handle sets `_pendingEntry`,
and the name prompt opens from `_updateDeathFade` once the panel is actually on
screen — not from `_endGame`, which would freeze the loop before the reveal ran.

The prompt freezes the run rather than pausing around it: `_loop` returns after
rendering while `handleDialog.isOpen`, and `promptForHandle` wraps it in
`input.setSuspended(true)` so typing a handle neither drives the player nor leaves
the keys held when it opened stuck down.

## Input

Keyboard state is a `Set` of `e.code` in `Input`, surfaced as axis getters
(`moveX`, `moveZ`, `sprint`) and edge-triggered intents (`punchPressed`,
`jumpPressed`, `liftPressed`). Add new actions as getters there and read them in
`Player.update`. Keys clear on window `blur` to avoid stuck movement — keep it.
Touch action buttons are a data list in `MobileControls` (`this._actions`) — add a
button there, not another branch.

## Shared leaderboard

`/api/scores` (`server/scoreHandlers.mjs`) is GET the board, POST a finished run.
It is mounted in the same three places as everything else — `vite.config.js`,
`server/index.mjs`, `api/[...path].js` — and storage follows the gate's pattern
exactly: `server/scoreStore.mjs` uses the Postgres `high_scores` table when
`DATABASE_URL` is set and `data/scores.jsonl` when it is not, so `npm run dev`
needs no database.

`addScore` writes **only when the run makes the board**, which is what keeps the
table small with no prune job. `BOARD_SIZE` there mirrors `HIGH_SCORE_SLOTS` in
`src/PlayerProfile.js` — keep them equal, or a run places on one board and not the
other. The handler imports `sanitizeHandle` from `src/PlayerProfile.js` so a
handle means the same thing on both ends; keep that module's top level free of
browser globals.

**The board is public and the client is trusted.** Rows carry the session email
when the gate is on, so `listScores` projects it away on both backends — never
return a stored row directly. And since the browser reports its own kills and
time, `validate()` is sanity bounds (kill count, duration, a floor on seconds per
kill), not anti-cheat: a crafted POST can still put anything up there. Making it
authoritative would mean simulating the fight server-side.

## Email gate & mail server

The gate (`src/EmailGate.js` + `server/`) has **three levels**, defined once in
`server/gateLevel.mjs` and selected by `EMAIL_GATE_LEVEL`: `0` off (no gate, no
dashboard), `1` collect (the form stores the address on submit, no SMTP), `2`
verify (a 6-digit code over a self-hosted SMTP relay — `server/mailer.mjs`, via
`nodemailer`, no 3rd-party email API). Default is 0.

**One setting, read in two places — keep them in step.** `vite.config.js` inlines
the level as `__EMAIL_GATE_LEVEL__` (so level 0 dead-code-eliminates the gate and
drops `admin.html` from the build inputs), and the server reads it at runtime.
**The server is authoritative**: `startVerification`/`completeVerification` each
re-check the level and refuse what that level doesn't allow, so a crafted request
can't skip level 2's code step or reach a disabled gate. Don't move that check
into the client, and don't add a level without extending `gateLevel.mjs`.

The client picks its form from `/api/gate-status`'s `level`, then branches on the
*response* (`subscribed` → let them in, `code-sent` → show the code step) rather
than on what it was built with — so a build/server mismatch still lands on the
right step. Level 1 issues the session cookie from `/api/subscribe/start`, level 2
from `/api/subscribe/verify`; both are the `201`.

The admin toggle only pauses collection at levels 1–2; it defaults to **on**
because the level already decides whether a gate exists.

**Storage has two backends, chosen by one check.** `server/db.mjs`'s
`isDatabaseConfigured()` is just "is `DATABASE_URL` set?", and three modules
branch on it: `subscriberStore.mjs` (addresses), `settings.mjs` (the toggle) and
`verificationStore.mjs` (level 2's pending codes) each use Postgres when it is
set and their original file/in-memory path when it is not. Keep that fallback —
it is what lets `npm run dev` and `npm start` run with no database. Nothing
outside those three modules should know which backend is live, and new gate
state needs both paths, not just the SQL one. `ensureSchema()` creates the
tables on first use (all `IF NOT EXISTS`), so there is no migration step.

**The routes are mounted in three places and must agree:** the Vite middleware
in `vite.config.js` (dev), `server/index.mjs` (`npm start`), and
`api/[...path].js` (Vercel's catch-all function). Adding or renaming an endpoint
means editing all three. Read bodies with `server/jsonBody.mjs` rather than
consuming the request stream directly — Vercel parses the body before the
handler runs and leaves the stream drained, so a hand-rolled reader gets nothing
there. See [docs/vercel-deployment.md](docs/vercel-deployment.md).

Before touching `server/mailer.mjs`, `.env.example`'s `SMTP_*` vars, or Postfix
config, read and follow [docs/postfix-security.md](docs/postfix-security.md): it
covers header injection, open-relay, TLS, and rate-limiting requirements.

## Code style

- ES modules only (`"type": "module"`) — `import`, never `require`.
- PascalCase classes, filename matches class; `_`-prefixed private methods/fields.
- Comments explain _why_ (the dt clamp, the root/rig split), not _what_. Keep them
  terse and purposeful — match the existing density.
- Only commit/push when asked. No CI or hooks to satisfy.
