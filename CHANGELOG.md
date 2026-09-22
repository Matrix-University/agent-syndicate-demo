# Changelog

All notable changes to this project are documented in this file, which follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format. This project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

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

- Throwing the carried car now works from the lift control as well as the attack
  control. The HUD prompt reads `J / LIFT — THROW THE CAR` and the touch button
  relabels itself to `THROW`, but only the attack input actually threw — pressing
  **E**, or tapping that THROW button, did nothing.
- The thrown car now hits agents it passes over in a single frame instead of only
  the ones near its exact position when a hit test runs, by sweeping the car's
  travel segment each frame instead of testing a single point.
- Sprint now only applies when moving forward. Holding Shift while strafing or
  backing up no longer sprints.
