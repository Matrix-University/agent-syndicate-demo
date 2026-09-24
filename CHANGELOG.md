# Changelog

All notable changes to this project are documented in this file, which follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format. This project uses
[Semantic Versioning](https://semver.org/).

## [0.4.1] - 2026-09-24

### Added

- Player handles are mirrored into a one-year cookie, so returning players are
  not prompted again when local storage is cleared or unavailable.
- The objective now starts with `DEFEND YOURSELF` and changes to `THROW CAR TO
DESTROY AGENTS AND ESCAPE THE GARAGE` after three agents are defeated.

### Changed

- The HUD now shows the current player's handle beside the health meter and its
  EDIT button, removing the duplicate handle row and freeing screen space.
- Agent health is reduced from 25 to 9.
- The defeat screen title now reads `GAME OVER`.

## [0.4.0] - 2026-09-24

### Added

- Player handles. A first-time player is asked for one before their first run —
  LEETIFY rewrites what they type in leetspeak, and leaving the field blank takes
  the suggested handle. The HUD shows it beside an EDIT button that reopens the
  prompt, and the run freezes while the prompt is open, so typing a handle never
  drives the player.
- A live session readout while you play: the arcade bar's 1UP column counts
  agents down and session length, where a session is one life, timed from spawn
  to the moment the player goes down.
- An arcade high score board, in the Pac-Man/Galaga idiom: a top-9 table kept
  between sessions, a 1UP / HIGH SCORE readout across the top of the screen, and
  a rank on the way out. The HIGH SCORE column switches to your run and blinks
  the moment it passes the board's top row.
- The game-over panel now reports the finished session — handle, agents
  neutralized, session length — then `NEW HIGH SCORE` or `RANKED 3RD` above the
  board, with the row you just took blinking. Placing without a handle opens
  `YOU MADE THE BOARD` to name the row (or take `ANON`), the way a cabinet asks
  for initials.
- Board order is most agents killed, shortest session breaking a tie. A run
  without a kill never places, and a tie keeps the incumbent — you have to beat a
  row, not match it.
- A **shared** high score board at `/api/scores`, stored the same way the email
  list is: the Postgres `high_scores` table when `DATABASE_URL` is set,
  `data/scores.jsonl` when it is not, and mounted in all three route tables
  (`vite.config.js`, `server/index.mjs`, `api/[...path].js`). Runs are only
  written when they make the board, so the table stays small with no prune job.
- The two boards work together: the game shows the shared board whenever the API
  answers and its own `localStorage` board whenever it doesn't — offline, on a
  static deploy, or with storage blocked — and labels the panel `GLOBAL` or
  `LOCAL` so it is always clear which one you are looking at. A run is recorded
  locally either way, and a best run stored by an earlier build is migrated into
  the local board on load.
- The board's blinking follows `prefers-reduced-motion`, and the game-over panel
  compacts itself on short screens so nine rows still fit on a landscape phone.

### Changed

- The HUD heading now reads its version from `package.json` (inlined by
  `vite.config.js` as `__APP_VERSION__`) instead of the hardcoded
  `prototype 0.1`, so it can't drift from the released version again.
- `README.md`, `CLAUDE.md` and [docs/vercel-deployment.md](docs/vercel-deployment.md)
  now cover the leaderboard: the new route, which storage backend answers it, and
  the rule that `BOARD_SIZE` in `server/scoreStore.mjs` must match
  `HIGH_SCORE_SLOTS` in `src/PlayerProfile.js`.

### Security

- A score row records the submitting session's email when the email gate is on,
  so `data/scores.jsonl` is now gitignored alongside `data/emails.jsonl`, and
  `listScores` projects the address away on both backends — the public board
  never returns it.
- Submitted runs are validated server-side (kill count, duration, and a floor on
  seconds per kill) and handles are sanitized with the same rules the client
  uses. These are sanity bounds, not anti-cheat: the browser reports its own
  kills and time, so a crafted request can still put anything on the board.
  Treat it as bragging rights, not a record of play.

## [0.3.1] - 2026-09-24

### Added

- The email gate can now run on Vercel. The API is mounted as a serverless
  function (`api/[...path].js`) alongside the static build, and setting
  `DATABASE_URL` moves everything the gate persists — collected addresses, the
  admin toggle, and level 2's pending codes — into Postgres, which a read-only
  serverless filesystem cannot hold on disk. Provisioned through the Neon
  marketplace integration, so it bills on the existing Vercel invoice rather
  than a second subscription. Leave `DATABASE_URL` unset and nothing changes:
  `npm run dev` and `npm start` still use the local data files and need no
  database.
- [docs/vercel-deployment.md](docs/vercel-deployment.md): why the file-backed
  storage cannot work on a serverless host, how the backend is selected, the
  environment variables to set, what it costs, and the caveats that come with
  running the gate across short-lived instances.
- The email gate now defaults to disabled, so the game remains playable while
  SMTP is not configured. Enable it from `/admin.html` only after the
  production relay is ready. Missing admin secrets now produce an unauthorized
  response instead of crashing the server.
- An email gate: playing now requires verifying an email address with a
  6-digit code sent to it (10-minute expiry, 5 attempts, 30s resend cooldown),
  before it's collected server-side into `data/emails.jsonl` for the site
  owner's marketing list. Returning players aren't asked again on the same
  browser. Codes are sent over SMTP (`server/mailer.mjs`, via `nodemailer`) —
  configured with your own mail server or provider, not a 3rd-party email API.
  Works identically in `npm run dev` and in production via the new standalone
  server (`server/index.mjs`, run with `npm start` after `npm run build`).
- A signed, httpOnly session cookie (`server/session.mjs`, ~180 days) set once
  an email is verified, checked via a new `/api/session` endpoint. Returning
  players are recognized even if `localStorage` is cleared, without a
  server-side session store.
- [docs/postfix-security.md](docs/postfix-security.md): a hardening guide for
  the self-hosted SMTP relay (open-relay, TLS, rate limiting, header
  injection, logging). `server/mailer.mjs` now rejects header-injection
  characters in the email/code before sending, verifies the relay's TLS
  certificate by default (`SMTP_TLS_REJECT_UNAUTHORIZED`), and logs sends
  without ever logging the verification code.
- An admin dashboard at `/admin.html` (`ADMIN_PASSWORD` in `.env`, signed
  session cookie, 15-minute lockout after 5 failed logins): toggle the email
  gate on/off (`data/settings.json`), and download everyone verified so far as
  a CSV (`/api/admin/emails.csv`) for an email marketing tool.
- Pick up and throw a car. One car — the one parked by the entry ramp — can be
  lifted overhead with **E** (or the touch LIFT button) and hurled with **J**,
  flattening any agent it ploughs through. It tumbles, crashes off pillars and
  walls, settles wherever it lands as solid cover, and can be picked up again.
- An overhead carry pose: the character walks and stands holding the car up,
  slowed down while loaded, with punching and jumping unavailable until it is
  thrown.
- Crowd combat: five agents circle the player and take turns through two attack
  slots. Last-hit reinforcements grow the crowd to seven, defeated agents respawn,
  and hair variants keep the agents visually distinguishable.
- Enemy strikes, player health and invulnerability, defeat feedback, scoring, and
  keyboard or touch retry.
- The camera now stays within the garage walls instead of drifting through them.

### Changed

- Everything the email gate persists now goes through a storage module with two
  backends, picked by whether `DATABASE_URL` is set: `server/subscriberStore.mjs`
  for addresses, `server/settings.mjs` for the admin toggle, and
  `server/verificationStore.mjs` for pending codes. Callers no longer touch the
  filesystem directly, and the tables are created on first use, so there is no
  migration step. Storing an address is now atomic — the old read-then-append
  could drop a signup when two arrived together.
- Level 2's pending verification codes are no longer held in process memory when
  a database is configured. Across serverless instances the one checking a code
  is not the one that sent it, so the TTL, resend cooldown and attempt count now
  live in a row rather than a `Map`.
- Request bodies are read through `server/jsonBody.mjs`, shared by both handler
  modules instead of duplicated in each. It prefers a body the host has already
  parsed: Vercel's Node runtime parses it before the handler runs and leaves the
  stream drained, which would otherwise have made every POST look empty.
- The car throw is now a two-handed overhead heave instead of a one-armed toss.
  The library's only throw is a grenade throw, so bound to the car it played as a
  punch thrown while the car floated overhead. The new `Throw_Overhead` is authored
  by the bake: the car is cocked back over the head, whipped forward with the hips
  and trunk driving through it, and released at full extension, with the car
  tracking the hands the whole way. The old clip still ships, unbound.
- The character GLB now ships fourteen clips instead of ten. The four new ones —
  authored `Carry_Overhead_Loop` and `Carry_Overhead_Idle` for the overhead hold,
  the authored `Throw_Overhead`, plus the library's `Throw` — are purely additive:
  every previously shipped clip, and the character mesh itself, is byte-for-byte
  unchanged.
- You now start near the garage elevator, facing into the parking deck.
- Running now uses its own animation instead of a sped-up walk, for a more natural
  sprinting stride.
- Punches now auto-target the nearest engaged agent — favoring whichever one
  you're already fighting and weaker agents — instead of only ever hitting a
  single fixed enemy.
- The HUD now tracks player health, aggregate crowd health, active and defeated
  agent counts, and the number of attack slots.

### Fixed

- Every `/api/` route now reaches the serverless function on Vercel, not just the
  single-segment ones. `api/[...path].js` was being matched as a one-segment
  dynamic route, so `/api/gate-status` and `/api/session` were answered while
  `/api/admin/*` and `/api/subscribe/*` returned the platform's own 404 before the
  function ever ran — the admin dashboard could not log in and no address could be
  submitted. `vercel.json` now rewrites `/api/:path*` to the function explicitly
  instead of relying on filename inference, and the handler falls back to the
  catch-all's `path` param so it resolves the route whether `req.url` carries the
  original path or the rewrite destination.
- Throwing the carried car now works from the lift control as well as the attack
  control. The HUD prompt reads `J / LIFT — THROW THE CAR` and the touch button
  relabels itself to `THROW`, but only the attack input actually threw — pressing
  **E**, or tapping that THROW button, did nothing.
- The thrown car now hits agents it passes over in a single frame instead of only
  the ones near its exact position when a hit test runs, by sweeping the car's
  travel segment each frame instead of testing a single point.
- Sprint now only applies when moving forward. Holding Shift while strafing or
  backing up no longer sprints.
