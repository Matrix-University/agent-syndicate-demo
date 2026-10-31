# Arcade feature delivery and handoff

## Confirmed decisions (2026-10-31)

- Keep endless spawning. Defer the 101 spawn cap, escape unlock, and ending rules.
- The existing desktop `101` cheat toggles short car throws. Any run that
  activates it keeps its handle with a **POTENTIAL subtitle** on both scoreboards,
  even after toggling it off. The subtitle replaces the earlier handle-alias
  implementation per the user's follow-up.
- Car landings should damage nearby agents AND visibly damage the car.
- Preserve the existing regeneration work: no damage for 3 minutes, first 10%
  heal at 3:30, then every 30 seconds. Movement does not interrupt it this pass.
- Intro animation and donation URL are not ready; do not invent either.

## Delivery checklist

Complete and validate each slice before moving on. This document is the durable
handoff if the session stops. No commits or pushes were requested.

| Slice | Status | Implementation and acceptance |
| --- | --- | --- |
| Five agent looks | Verified | Blonde, bald, red, brown, black; identical body dimensions and shared kit; roster screenshot inspected. |
| Ramp arrivals | Verified | Physical ramp; all five lanes reach the spawn area, car bay and center lane against actual garage colliders. Arrival takes no attack slot. Initial nearby group preserved. Player climbing/jumping and parked-car collisions checked. |
| Car landings | Verified | Final flight segment and landing hit exactly once per agent per throw; multi-kill and radius checks pass. Three levels of cosmetic compression, reset on retry; before/after screenshots inspected. This is visual compression, not a vehicle-health or mesh-fracture system. |
| POTENTIAL score subtitles | Verified locally and in browser | Original handle plus POTENTIAL subtitle. Activation latched for the life, persisted as `usedCheat`, cleared on retry. Postgres adds `used_cheat` automatically; existing rows default false. Live DB migration not exercised. |
| Existing regeneration | Verified unchanged | `node scripts/check-health-regen.mjs` passes, including damage priority, UI, pause, fractional healing, and multiple frame rates. |

## Validation and worktree

At task start there were staged edits to `CHANGELOG.md`, `README.md`,
`src/Game.js`, `src/Player.js`, and a new `scripts/check-health-regen.mjs`;
`README.md` also had unstaged edits. Preserve them.

Use existing Node assertion scripts and the browser driver; no new dependencies.
Run focused checks, `npm run build`, then
`node .claude/skills/run-agent-syndicate-demo/driver.mjs smoke` (Windows shell:
use backslashes in paths). Driver script mode can assert `window.__game` state
and capture screenshots in `.run-shots/`. Inspect screenshots, not just exits.
Do not submit synthetic runs to a shared/production board.

## Remaining backlog

1. NeoMatrixology intro: obtain local asset, usage permission, format and timing.
   Introduce the fused Twins / exile / Hulk form with an accessible skip control;
   do not author a speculative cinematic or replace the current baked player.
2. Agent-specific attacks and death from above: agree on a color-to-move mapping,
   readable telegraphs and dodge windows; player Hulk shares ground moves but
   never death from above. Check the animation catalog before authoring clips.
3. Resolve the 101-cap/escape versus endless-play conflict before changing rules.
   Multi-kills already feed the ordinary score; no forced victory is planned.
4. High-score system configuration, error logs and branded copy: define settings,
   operator access and log retention/redaction before adding infrastructure.
5. Donation: obtain the real destination URL; use a labeled, keyboard-accessible
   link, no automatic navigation or invented payment integration.
6. Monthly unique badges: define eligibility, month/timezone, award snapshots,
   duplicates, custody and whether "NFT principles" means off-chain uniqueness
   or real minting. Do not add wallets or blockchain dependencies speculatively.
7. Mobile cheat: count completed/started lives per handle on this device (decision
   still needed), reveal a labeled icon on the second life, and define storage
   duration explicitly. Existing desktop code is in `src/Input.js`; mobile
   activation is not implemented merely by marking scores.
8. Stationary-only regeneration is intentionally deferred, not completed.

## Latest verification

- Passed: `node scripts/check-arcade-features.mjs`,
  `node scripts/check-short-throw.mjs`, `node scripts/check-handles.mjs`,
  `node scripts/check-health-regen.mjs`, `npm.cmd run build`.
- PowerShell blocks `npm.ps1`; use `npm.cmd`, without changing execution policy.
- Browser driver from the repo CWD stops at the locally configured email gate.
  Run it from a separate scratch working directory (its repo path is absolute);
  this uses the default no-gate development configuration and keeps test score
  files out of the repository. Do not modify the real `.env` or bypass auth.
- Isolated smoke run rendered correctly and passed spawn, camera, punch and
  reinforcement assertions. Its timed W assertion failed (0.59m, expects >2m)
  with the crowd blocking the spawn lane. Do not report full smoke success.
- Focused browser checks passed: all 15 lane/target combinations reached orbit
  range in 5.1-32.4 simulated seconds; unobstructed keyboard movement covered
  2.64m in the timed check. Roster, pristine/damaged car, ramp, and 390x844 mobile
  screenshots were inspected. No synthetic score was sent to the shared board.
- Reusable browser commands are `scripts/check-arcade-browser.txt`. Run the
  existing driver in `script` mode with that file (both absolute paths if using
  a scratch CWD). The driver's script mode logs assertion failures as `ERR` but
  still exits 0: inspect its output. Both focused runs contained no `ERR`.
- Final Node checks and production build passed again after ensuring floor
  correction cannot teleport a player onto parked cars. No dependencies,
  generated character assets, or real environment settings changed in that pass.
- Subtitle follow-up: `node scripts/check-score-subtitles.mjs`,
  `node scripts/check-handles.mjs`, `node scripts/check-arcade-features.mjs`,
  `node scripts/check-short-throw.mjs` and `npm.cmd run build` pass. API/file
  round trips use throwaway storage, including legacy rows and strict boolean
  validation. Postgres DDL is updated but has not been run against a live database.
- Subtitle screenshots inspected on desktop and 390x844 mobile. Browser
  assertions confirm the handle stays intact, only assisted runs get subtitles,
  the label sits beneath the name, the board fits horizontally, and overflowing
  rows accept scroll input with Retry reachable. The final build passes.

## Pickup points for the next AI

- Runtime: `src/AgentKit.js` and `src/Enemy.js` define the roster;
  `src/World.js` exports `ENTRY_RAMP` and shares its physical floor height;
  `src/EnemyManager.js` places returning agents in `enter` then `arrive` states.
- `src/LiftableCar.js` retains a consumable landing event across the physics to
  combat transition; `src/CombatSystem.js` resolves it with the last swept segment.
- `src/Input.js` latches `shortThrowUsed` through toggle-off, blur and game over.
  `src/Game.js` snapshots the original name and `usedCheat` at death;
  `src/PlayerProfile.js` preserves both through storage and post-run naming.
  `src/RemoteScores.js`, `server/scoreHandlers.mjs`, and `server/scoreStore.mjs`
  round-trip the flag; `server/db.mjs` adds `used_cheat` for new/existing tables.
  Legacy alias-only POTENTIAL entries cannot recover their original names, so
  do not infer cheat use from a handle or guess a replacement name.
- The full smoke test's crowded movement threshold remains an open test issue.
  Preserve that evidence; do not weaken assertions just to report green.
- Continue with the remaining backlog above, obtaining decisions/assets first.
  All work remains uncommitted; preserve the original staged changes.

## Review fixes (2026-10-31)

Both medium-severity findings from the review are fixed:

- `Enemy._routeEntry` moves blocked entry targets around enabled colliders and
  past their far edge. Entry completion uses an exit line so several agents
  sharing a detour cannot permanently pin one another at a single point.
  Car colliders remain effective; carried/airborne cars are still ignored.
- `World.canFollowFloor` identifies continuous ramp-to-floor travel.
  `Player.update` follows it only when previously grounded on the floor and not
  taking off. Ramp side/top ledges and stepping off parked cars still cause
  falls; this does not snap the player onto vehicle roofs.

Validation:

- `node scripts/check-ramp-regressions.mjs` reproduced both findings before the
  fixes and now passes at 20/30/60/120 simulated FPS. It covers actual short-throw
  landings, rotated/offset cars, a collider activated during entry, all seven
  agents reaching combat, slot-free arrivals, downhill actions on the slope,
  continuous ramp exits, and ledges.
- Existing arcade, short-throw, and health-regeneration checks pass, as does
  `npm.cmd run build` and `git diff --check`.
- `scripts/check-ramp-browser.txt` passed against actual garage colliders and
  loaded models. All seven agents reached combat in 6.5-8.3 simulated seconds
  across eight blocker/frame-rate combinations. Walking/sprinting remained
  grounded; punching and jumping were accepted while still on the slope.
  Screenshots of detours and downhill contact were inspected.
- The earlier full-smoke crowded-movement threshold remains a separate open
  test issue; only the focused browser checks above were rerun for these fixes.
