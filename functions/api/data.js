// Cloudflare Pages Function: stores the whole tracker as one JSON blob in KV.
// Setup (see README.md): create a KV namespace, bind it as BUNNY_KV,
// and set an environment variable BUNNY_KEY (the "family password").
const KEY = 'data';
const SNAP_PREFIX = 'data:snap:';
const SNAP_DAYS = 30;   // daily snapshots expire on their own after this many days

function authorized(request, env) {
  return env.BUNNY_KEY && request.headers.get('x-bunny-key') === env.BUNNY_KEY;
}

// Compare two blobs ignoring the save timestamp, so a re-push of identical
// data does not count as a change.
function sameData(a, b) {
  try {
    const strip = s => { const o = JSON.parse(s); delete o.updatedAt; return JSON.stringify(o); };
    return strip(a) === strip(b);
  } catch { return false; }
}

function todayPacific() {
  return new Date().toLocaleDateString('sv', { timeZone: 'America/Los_Angeles' });   // YYYY-MM-DD
}

export async function onRequestGet({ request, env }) {
  if (!authorized(request, env)) return new Response('unauthorized', { status: 401 });
  const value = await env.BUNNY_KV.get(KEY);
  return new Response(value || 'null', { headers: { 'content-type': 'application/json' } });
}

export async function onRequestPut({ request, env }) {
  if (!authorized(request, env)) return new Response('unauthorized', { status: 401 });
  const body = await request.text();
  if (body.length > 800000) return new Response('too big', { status: 413 });
  try { JSON.parse(body); } catch { return new Response('bad json', { status: 400 }); }

  // Snapshot the previous copy once per day, but only when the data actually changed.
  // The snapshot holds the last known-good state from before the change.
  const prev = await env.BUNNY_KV.get(KEY);
  if (prev && !sameData(prev, body)) {
    await env.BUNNY_KV.put(SNAP_PREFIX + todayPacific(), prev, { expirationTtl: SNAP_DAYS * 86400 });
  }

  await env.BUNNY_KV.put(KEY, body);
  return new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } });
}
