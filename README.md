# Penny & Lolo 🐰

A cozy health tracker for two very important bunnies. Tracks medications, weights,
appointments, vaccines, flea treatments, temperatures, and notes, with reminders
she can check off or snooze.

## How it works

- **Static app**: `index.html` + `app.js`, no build step. Works offline-first:
  everything is saved to the phone (localStorage) instantly.
- **Optional cloud sync**: a tiny Cloudflare Pages Function (`functions/api/data.js`)
  stores the data in Cloudflare KV so it survives Safari data clears and syncs
  between phones. Off by default until you set it up.

## Deploy on Cloudflare Pages

1. Push this repo to GitHub.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** →
   pick this repo.
3. Build settings: **no framework, no build command, output directory `/`**. Deploy.
4. Point your custom domain at it under the project's **Custom domains** tab.

That's enough to use the app device-only.

## Turn on sync (recommended)

1. Dashboard → **Storage & Databases → KV** → Create namespace, name it `bunny-data`.
2. Pages project → **Settings → Bindings → Add → KV namespace**:
   variable name `BUNNY_KV`, pick the `bunny-data` namespace.
3. Pages project → **Settings → Environment variables → Add**:
   name `BUNNY_KEY`, value = a family password you two share. Encrypt it.
4. In `config.js`, set `enabled: true`. Commit & push (Pages redeploys automatically).
5. Open the app, and it asks once per device for the family password, then syncs.

Sync is last-write-wins on the whole dataset, which is fine for one or two people.

## Turn on daily push reminders (optional, needs sync on)

When something on a care plan is due (or overdue), every signed-up phone gets a
morning notification around 8 AM Pacific. One-time setup:

1. `node scripts/gen-vapid.mjs` prints a public and a private key.
2. Paste the PUBLIC key into `config.js` (`PUSH.publicKey`) and into
   `push-worker/wrangler.toml` (`VAPID_PUBLIC`).
3. In `push-worker/wrangler.toml`, paste your KV namespace id (dashboard →
   KV → bunny-data → copy id).
4. Deploy the scheduler: `cd push-worker && npx wrangler deploy`, then
   `npx wrangler secret put VAPID_PRIVATE_JWK` and paste the PRIVATE key.
5. Commit and push the `config.js` change (never the private key).

On her phone: pin the app to the home screen first, open it from the icon, and
tap "turn on daily reminders" at the bottom of the home screen (iOS only allows
notifications for pinned web apps, iOS 16.4+). The scheduler sends a content-free
ping; her phone composes the notification text locally, so the push service never
sees any bunny data.

## Backups

Each care plan has "Save <bunny>'s data as a file": on iPhone it opens the share
sheet (save to Files, AirDrop, email), on desktop it downloads a JSON file.

## Domain

None required: the free `<project>.pages.dev` URL works fine for a pinned app.
A custom domain can be bought later through Cloudflare Registrar and attached
under the project's Custom domains tab.

## Pin it on her iPhone

Open the site in Safari → Share → **Add to Home Screen**. It gets the pink bunny
icon, the name "Penny & Lolo", and opens full-screen like a real app.

## Local preview

Any static server works: `python3 -m http.server` in the repo, then open
`http://localhost:8000`. (The sync API only exists when running on Cloudflare
Pages; locally the app just uses on-device storage.)

## Files

| File | What it is |
|---|---|
| `index.html` | app shell + all styles |
| `app.js` | all app logic |
| `config.js` | sync + push switches |
| `sw.js` | service worker: instant offline open + shows push notifications |
| `functions/api/data.js` | Pages Function (GET/PUT the data blob in KV) |
| `functions/api/push.js` | Pages Function (stores push signups in KV) |
| `push-worker/` | scheduled Worker that sends the morning pings |
| `scripts/gen-vapid.mjs` | one-time push key generator |
| `manifest.webmanifest`, `icons/` | home-screen app bits |
| `images/` | the stars of the show |
