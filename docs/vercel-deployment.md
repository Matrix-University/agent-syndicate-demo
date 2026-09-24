# Deploying to Vercel (with Neon Postgres)

The game itself is static and deploys anywhere. The **email gate** is the part
that needs a server, and Vercel gives it a shape the original design did not
assume: no long-lived process, and a **read-only filesystem**.

This document covers running levels 1 and 2 on Vercel. At the default
`EMAIL_GATE_LEVEL=0` none of it applies — the gate compiles out, nothing calls
`/api/*`, and a plain static deploy is enough.

## Why the file-backed storage cannot work there

Three pieces of state were written to disk, which is correct for `npm start` on
a VPS and impossible on Vercel:

| State | Was | Why it breaks |
| --- | --- | --- |
| Collected addresses | `data/emails.jsonl` | `fs.appendFile` throws `EROFS` on a read-only filesystem |
| Gate on/off toggle | `data/settings.json` | same |
| Pending level-2 codes | in-process `Map` | each request can hit a different instance, so the one checking the code is not the one that sent it |

`/tmp` is writable but per-instance and wiped between invocations, so it solves
none of them.

## How the storage is selected

`server/db.mjs` exposes `isDatabaseConfigured()`, which is simply
**"is `DATABASE_URL` set?"**. Every storage module branches on it:

- `server/subscriberStore.mjs` — Postgres `subscribers` table, else `data/emails.jsonl`
- `server/settings.mjs` — Postgres `settings` table, else `data/settings.json`
- `server/verificationStore.mjs` — Postgres `pending_verifications` table, else the in-process `Map`

Nothing else in the codebase knows which backend is live. That keeps
`npm run dev` and `npm start` working with **zero database setup** — leave
`DATABASE_URL` unset and the original file behaviour is unchanged.

Tables are created on first use by `ensureSchema()` (all `IF NOT EXISTS`,
cached per warm instance). There is no migration step to run.

## One routing table, three hosts

The request handlers in `server/` are the single implementation. Three entry
points mount the same routes:

| Host | Entry point |
| --- | --- |
| `npm run dev` | the Vite middleware in `vite.config.js` |
| `npm start` | `server/index.mjs` |
| Vercel | `api/[...path].js` |

**Adding or renaming a route means editing all three.** `api/[...path].js` is a
catch-all function: Vercel serves `dist/` statically and routes everything under
`/api/` to it.

## Setup

1. **Add Neon.** In the Vercel dashboard: your project → Storage → install Neon
   from the Marketplace. Choose the **native integration** — Vercel creates the
   Neon account and project, and billing stays on your Vercel invoice instead of
   becoming a second subscription. It injects `DATABASE_URL` automatically.

2. **Set the environment variables** (Settings → Environment Variables):

   | Variable | Needed for | Notes |
   | --- | --- | --- |
   | `DATABASE_URL` | levels 1–2 | injected by the Neon integration; do not set by hand |
   | `EMAIL_GATE_LEVEL` | levels 1–2 | **read at build time as well as runtime** — changing it needs a redeploy, not just a restart |
   | `SESSION_SECRET` | levels 1–2 | `openssl rand -hex 32`. Without it, sessions do not survive and admin login fails with a generic "Invalid request." |
   | `ADMIN_PASSWORD` | levels 1–2 | the `/admin.html` login |
   | `SMTP_*` | level 2 only | see `.env.example` and [postfix-security.md](postfix-security.md) |

3. **Deploy.** `vercel.json` pins the build command and `dist/` output.

## Cost

Neon's Free plan is permanent and needs no card: 0.5 GB storage and 100
CU-hours of compute per project per month. The gate runs two queries per signup
and the database autosuspends when idle, so a demo-scale project stays inside
it. The tradeoff of autosuspend is a cold start of roughly half a second on the
first query after a quiet period — invisible on a form submit, and nothing in
`src/` touches the database.

## Known limitations on serverless

- **Admin login lockout is per-instance.** `server/adminAuth.mjs` counts failed
  attempts in module scope. On one long-lived process that is a real 15-minute
  lockout after 5 failures; across serverless instances an attacker gets that
  many tries *per instance*, so the lockout is weaker than it looks. Use a long,
  random `ADMIN_PASSWORD` — it is the only thing standing between a guess and
  the dashboard. Moving the counter into the `settings` table would restore it.
- **Level 1 addresses are still unverified** — that is the level's design, not a
  Vercel issue, but it is worth remembering before treating the CSV as a
  confirmed-opt-in list.
