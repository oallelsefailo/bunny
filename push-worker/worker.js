// Scheduled Cloudflare Worker: every morning, if anything on a care plan is
// due (or overdue), send a push to every subscribed phone. The pushes carry no
// payload (no encryption needed); the app's service worker composes the
// notification text itself. Setup steps live in the repo README.

function b64u(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function vapidAuth(endpoint, env) {
  const enc = new TextEncoder();
  const header = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = b64u(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env.VAPID_SUBJECT || 'mailto:admin@example.com',
  })));
  const key = await crypto.subtle.importKey(
    'jwk', JSON.parse(env.VAPID_PRIVATE_JWK),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(header + '.' + payload));
  return 'vapid t=' + header + '.' + payload + '.' + b64u(sig) + ', k=' + env.VAPID_PUBLIC;
}

function anythingDue(db, today) {
  const sn = db.snoozes || {};
  for (const id of Object.keys(db.bunnies || {})) {
    const b = db.bunnies[id];
    for (const r of (b.routines || [])) if (r.nextDue) {
      if (r.nextDue < today) return true;                                   // overdue always counts
      if (r.nextDue === today && !(sn['rt:' + id + ':' + r.id] > today)) return true;
    }
    for (const a of (b.appts || []))
      if (!a.done && a.date === today && !(sn['appt:' + id + ':' + a.id] > today)) return true;
  }
  return false;
}

async function run(env) {
  const db = JSON.parse((await env.BUNNY_KV.get('data')) || 'null');
  if (!db) return;
  const today = new Intl.DateTimeFormat('sv', { timeZone: env.TZ_NAME || 'America/Los_Angeles' })
    .format(new Date());
  if (!anythingDue(db, today)) return;

  const subs = JSON.parse((await env.BUNNY_KV.get('subs')) || '[]');
  if (!subs.length) return;
  const keep = [];
  for (const s of subs) {
    try {
      const r = await fetch(s.endpoint, {
        method: 'POST',
        headers: { Authorization: await vapidAuth(s.endpoint, env), TTL: '86400' },
      });
      if (r.status === 404 || r.status === 410) continue;   // phone unsubscribed; prune
      keep.push(s);
    } catch (e) { keep.push(s); }
  }
  if (keep.length !== subs.length) await env.BUNNY_KV.put('subs', JSON.stringify(keep));
}

export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(run(env)); },
  async fetch() { return new Response('bunny-reminders: I only wake on a schedule 🐰'); },
};
