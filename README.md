# Agent Syndicate — Three.js prototype

A third-person seed for the brawler demo: a movable character with an animation state machine, a follow camera, and a blockout arena. The character is a placeholder built from primitives so the project runs with zero external assets; swap it for a Mixamo model when you're ready (see below).

## Run it

Requires [Node.js](https://nodejs.org) (20.6+, for `process.loadEnvFile`).

```bash
npm install
npm run dev
```

Vite opens `http://localhost:5173`. Move with **WASD / arrow keys**, **Shift** to
sprint, **J** to punch, **Space** to jump. The character turns to face its direction
of travel and switches between idle, walk/run, and one-shot action animations.

You start near the garage elevator with five system agents closing in. At most
two attack at once, reinforcements grow the crowd to seven, and defeated agents
return after a short delay. Survive as long as possible, then press **R** or tap
**HIT** to retry.

On a touch device, use the **left stick** for camera-relative movement. Push it to
the outer ring to sprint, drag open space on the right side to orbit the camera,
and use the separate **JUMP** and **HIT** buttons for actions. Keyboard and mouse
controls remain available on hybrid devices.

The HUD automatically shows the desktop or touch control mapping based on the
detected pointer. Its **KEYS / TOUCH** button can switch the displayed mapping for
the current page without disabling any keyboard, mouse, or touch controls.

To test on a phone connected to the same local network, expose the Vite server and
open the printed network URL on the device:

```bash
npm run dev -- --host
```

## Email gate

The email gate is **disabled by default** so the game remains playable before
an SMTP relay is configured. Once the relay is ready, an admin can enable it
from `/admin.html`. When enabled, visitors must verify an email address with a
6-digit code sent to it. Verified addresses are appended to
`data/emails.jsonl` (gitignored) for the site owner to use as a marketing list
— see [data/README.md](data/README.md).
Returning players aren't asked again: the browser remembers verified addresses
in `localStorage`, backed by a signed, httpOnly session cookie (~180 days) set
by the server, so they're still recognized even if `localStorage` is cleared.

### No email feature yet

You do **not** need to add SMTP environment variables while the email gate is
disabled. For the game to run without email collection, leave these unset:

```text
SMTP_HOST
SMTP_PORT
SMTP_SECURE
SMTP_USER
SMTP_PASS
SMTP_FROM
SMTP_TLS_REJECT_UNAUTHORIZED
SMTP_CONSOLE_FALLBACK
```

The server will use the default `emailGateEnabled: false`. You only need these
variables for the admin dashboard itself:

```env
SESSION_SECRET=replace-with-a-long-random-value
ADMIN_PASSWORD=replace-with-a-strong-unique-admin-password
```

If you do not need the dashboard yet, you can omit those too. The game will
still run with the gate disabled.

### Enabling email later

When your SMTP relay is ready, add the SMTP values to the server's `.env`, set
`SMTP_CONSOLE_FALLBACK=false`, restart the server, and enable the gate from
`/admin.html`. If you're running your own Postfix relay, see
[docs/postfix-security.md](docs/postfix-security.md) for hardening it (open
relay, TLS, rate limiting, SPF/DKIM/DMARC):

```bash
cp .env.example .env
```

### Development without an SMTP server

For local UI testing, the verification code can be printed in the terminal
instead of sent by email. Keep `SMTP_HOST` empty and add these values to your
local `.env`:

```env
SESSION_SECRET=replace-with-a-long-random-development-value
ADMIN_PASSWORD=replace-with-a-local-admin-password
SMTP_CONSOLE_FALLBACK=true
```

Run `npm run dev`, submit an email in the game, and copy the six-digit code
from the terminal running Vite. `SMTP_CONSOLE_FALLBACK=true` is for local
testing only and must not be enabled in production.

### Production environment

For real verification emails, point the app at an SMTP submission service or
your own Postfix relay. Use placeholders in documentation and real values only
in the untracked `.env` file:

```env
SMTP_HOST=mail.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=replace-with-smtp-username
SMTP_PASS=replace-with-smtp-password
SMTP_FROM="Agent Syndicate <no-reply@example.com>"
SMTP_TLS_REJECT_UNAUTHORIZED=true

SESSION_SECRET=replace-with-a-long-random-production-value
ADMIN_PASSWORD=replace-with-a-strong-unique-admin-password
SMTP_CONSOLE_FALLBACK=false
```

Generate a session secret locally with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

For a self-hosted Postfix relay, use `SMTP_HOST=127.0.0.1` only when Postfix
runs on the same server as this Node process. Configure SPF, DKIM, DMARC,
reverse DNS, firewall rules, TLS, and open-relay protection before accepting
real signups. See [docs/postfix-security.md](docs/postfix-security.md).

Never commit `.env`, SMTP credentials, admin passwords, session secrets, or
`data/emails.jsonl`. `.env.example` contains names and safe placeholders only.

### Vercel deployment note

Adding variables in the Vercel dashboard does not run this project's Node
server. The current production setup requires `server/index.mjs` to run as a
long-lived Node process because it serves the API, writes the email data file,
stores pending verification codes, and serves the admin dashboard API.

If Vercel only serves the static `dist/` files, the current game and
`/admin.html` dashboard will not work correctly because the client still needs
the API endpoints. Use a separate VPS for the Node API and persistent data,
with Postfix added later, or plan a separate serverless rewrite with persistent
storage before deploying this feature on Vercel. Vercel environment variables
are only useful once that API deployment architecture exists:

- Gate disabled, static game only: no SMTP variables; no admin variables unless
  a separate API handles the dashboard.
- Dashboard/API hosted on your own Node server: set `SESSION_SECRET` and
  `ADMIN_PASSWORD` there; keep SMTP variables unset until email is ready.
- Email gate enabled: add the production `SMTP_*` variables to the server that
  runs the API, not merely to a static Vercel project.

This also means **`npm run build` alone is not enough to deploy** — the built
app needs the verification endpoints behind it:

```bash
npm run build
npm start          # serves dist/ + the email endpoints on http://localhost:4173
```

`npm run dev` and `npm start` both handle `/api/subscribe/start`,
`/api/subscribe/verify`, and `/api/session` (via shared handlers in `server/`),
so the gate works locally as soon as `.env` is set up. Without SMTP, leave the
gate disabled or use the documented `SMTP_CONSOLE_FALLBACK=true` development
option; do not enable the gate in production until real delivery is working.

## Admin dashboard

For local development:

[http://localhost:5173/admin.html](http://localhost:5173/admin.html)

For production, use:

[https://your-domain.com/admin.html](https://your-domain.com/admin.html)

The production server must be running with `npm start`, and `ADMIN_PASSWORD` must be set in .env.

Visit `/admin.html` to log in (set `ADMIN_PASSWORD` and `SESSION_SECRET` in
`.env`) and:

- Toggle the email gate on/off. Off, players skip straight to the game; the
  setting is persisted in `data/settings.json` (gitignored) and survives a
  restart.
- Download everyone who's verified so far as a CSV, for an email marketing
  tool — `/api/admin/emails.csv`, converted from `data/emails.jsonl`.

Login uses a signed, httpOnly session cookie (12 hours) with a 15-minute
lockout after 5 failed password attempts. `ADMIN_PASSWORD` is a single shared
secret compared with a timing-safe check, not hashed — keep it strong and out
of version control (it only ever lives in `.env`).

## Project structure

```
index.html              canvas + HUD + email gate markup, loads src/main.js
admin.html              admin dashboard: login, gate toggle, CSV download
src/main.js             boots the Game after the email gate resolves
src/EmailGate.js         email gate UI logic: email step, code step, resend
src/admin.js            admin dashboard UI logic
server/index.mjs         standalone production server (serves dist/ + the API)
server/subscribeHandler.mjs start/complete verification, appends data/emails.jsonl
server/verificationStore.mjs pending codes: expiry, attempt limit, resend cooldown
server/session.mjs          signed session cookie so returning players skip the gate
server/signedCookie.mjs     generic HMAC-signed cookie helpers (session.mjs + adminAuth.mjs)
server/adminAuth.mjs        admin password check + lockout, admin session cookie
server/adminHandlers.mjs    admin login/logout/me, gate toggle, CSV export endpoints
server/settings.mjs         persisted settings (email gate on/off)
server/emailsExport.mjs     data/emails.jsonl -> CSV
server/mailer.mjs           nodemailer SMTP transport, configured via .env
server/requestHandler.mjs   shared HTTP request/response glue
src/Game.js             renderer, scene, camera, the update loop
src/World.js            lights, floor, grid, blockout pillars
src/Player.js           the character: rig, movement, animation state machine
src/Enemy.js            primitive enemy, health, hit reactions, attack AI
src/EnemyManager.js     crowd formation, attack slots, reinforcements, respawns
src/CombatSystem.js     punch and enemy-strike hit resolution
src/GreenCodeBurst.js   reusable enemy defeat particle effect
src/ThirdPersonCamera.js smooth follow camera
src/Input.js            keyboard + mobile gameplay input contract
src/MobileControls.js   touch joystick and action-button adapter
```

The important architecture choice: `Player.root` is the thing that moves through
the world (the camera follows it), and `Player.rig` is the visible body. Keeping
them separate means you replace the _visuals_ without touching the _movement_.

## Swapping in a real character

The GLTF loader is already wired up. `Player` loads a rigged `.glb`, binds its
clips to the animation state machine via a `THREE.AnimationMixer`, and crossfades
on state change. **No model is required** — without one, the primitive placeholder
shows, so the project always runs.

To use a real character:

1. Drop a rigged `.glb` (with Idle + Run clips) at **`public/models/agent.glb`**.
   See [public/models/README.md](public/models/README.md) for sources — the
   recommended one is [Quaternius](https://quaternius.com) (**CC0**, public domain,
   GLB-ready, suited figures that read well as Agents).
2. Run `npm run dev`. The character idles, then runs while you move.
3. Tune in [src/Game.js](src/Game.js): `modelScale` (so the body is ~3 units tall)
   and `modelYaw` (`Math.PI` if it faces the camera when moving forward).

Clips bind by case-insensitive name match (`CLIP_NAMES` in `Player.js`); the
movement code in `update()` is untouched. **Mixamo** also works — it exports
`.fbx`, so convert to `.glb` in [Blender](https://www.blender.org) first.

## Where this goes next (the roadmap)

1. ✅ Move a character around an arena (this seed).
2. ✅ Add edge-triggered punch input and a one-shot attack animation, including
   the zero-asset primitive fallback.
3. ✅ Add punch hit detection and one dummy enemy that takes damage and explodes
   into green code (a particle burst on death).
4. ✅ A crowd encircles the player, limited to two active attackers, with
   last-hit reinforcements, respawns, player health, and retry.
5. ✅ Pick up a car and throw it. One car is liftable — the one parked by the
   entry ramp. **E** grabs it, **J** heaves it; anything it ploughs through goes
   down. It re-settles wherever it lands and can be picked up again.

## Game Scenes

- Hell Club (video intro of Twins merging to make a hulk form)
- Parking garage (animated)
- Debir Court (game play)

## Agent Syndicate (seed idea)

Agent Syndicate Burly Brawl Game Demo
The Cliff Notes (Short Version) Re-skin the Burly Brawl Scene from Path of Neo (ps2). Playable game built with unreal engine.

**The longer version:**

The idea is to make a playable game demo. I'm looking for a gameplay style like the burly brawl from the Matrix reloaded/PON.
This is also a recreation of the Matrix Reloaded scene, just after the Oracle & Seraph leave, where Neo & Agent Smith fight in Debir Court during the sequel. But instead of Neo as the main Character I want Keanu to be substituted or 're-skinned' with a hulk sized "Agent Rayment",

In the Agent Syndicate webcomic they are identical twins, but in the proposed game demo, these twins combine to make one Hulk Sized Super Exile/Agent. This is the user, or playable character (Neo substitute).

Instead of fighting Smith clones, the enemies should be random NPCs. The NPCs should explode into green code when they are defeated.

All fighting should be hand to hand melee combat, perhaps Agent Rayment could grab poles out of the ground like we see Neo using the pole as a weapon in Reloaded.

One tricky game play detail, I'd want the player to be able to combine the twins to make the hulk version, but if they separate or undo hulk mode, making them separate twins again, then the health would slowly regenerate and the NPC bots wouldn't be able to attack them while they appear as non hostile twins. The twins would not be able to attack, or be attacked in this state to allow health regeneration.

_You can see the Twins here:_

https://agentsyndicate.online/

So let's say scene 1 is the Twins in Hel club, Agent Lewis instructs them to run into each other, they combine and transform into Hulk mode. Agent Lewis tells them they're flagged as exiles and that they need to draw the system Agents away from the club. Scene 2, the Hulk version gets attacked by system Agents in the parking garage of Hel club, mission one is to fight your way out of the parking garage to a hardline. Get to the handline and that's a check point. Scene 3, hardline takes you to Debir court where the Hulk version is attacked by more Agents. After defeating some kind of boss Agent, or specific number of Agents or survive long enough & Agent Lewis calls and gives them instructions on how to separate back into twins. Once they split she tells them to return to Hel club undetected.

That's just a rough game play flow.

Game demo visible [here](https://agent-syndicate-demo.vercel.app/)
