// ---- Sync settings ----
// Leave enabled:false to keep everything on-device (localStorage only).
// After setting up Cloudflare KV (see README.md), set enabled:true.
// The app will then ask once for the "family password" (the BUNNY_KEY you
// set in Cloudflare) and keep every device in sync.
const SYNC = { enabled: true, endpoint: '/api/data' };

// ---- Push reminders (optional, requires sync) ----
// Run `node scripts/gen-vapid.mjs`, paste the PUBLIC key here, then deploy
// push-worker/ (see README). The reminders bell appears once this is set.
const PUSH = { publicKey: 'BHFV4IbE5P1MMZ2rmFNhtPUHQfJfC9x0-IKrb4hAFi1rQfRJIzbGBgb-EUYNszMxgU3Oj3KvFtFzfv-23blPJp4' };
