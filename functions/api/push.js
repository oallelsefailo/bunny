// Cloudflare Pages Function: stores push subscriptions in KV (key "subs").
// The scheduled Worker in push-worker/ reads them each morning and pings
// every subscribed phone when something on a care plan is due.
const SUBS = 'subs';

function authorized(request, env) {
  return env.BUNNY_KEY && request.headers.get('x-bunny-key') === env.BUNNY_KEY;
}
async function readSubs(env) {
  try { return JSON.parse((await env.BUNNY_KV.get(SUBS)) || '[]'); } catch { return []; }
}

export async function onRequestPost({ request, env }) {
  if (!authorized(request, env)) return new Response('unauthorized', { status: 401 });
  let sub; try { sub = await request.json(); } catch { return new Response('bad json', { status: 400 }); }
  if (!sub || typeof sub.endpoint !== 'string') return new Response('bad sub', { status: 400 });
  const subs = (await readSubs(env)).filter(s => s.endpoint !== sub.endpoint);
  subs.push(sub);
  await env.BUNNY_KV.put(SUBS, JSON.stringify(subs.slice(-20)));   // plenty for a family
  return new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } });
}

export async function onRequestDelete({ request, env }) {
  if (!authorized(request, env)) return new Response('unauthorized', { status: 401 });
  let body; try { body = await request.json(); } catch { return new Response('bad json', { status: 400 }); }
  const subs = (await readSubs(env)).filter(s => s.endpoint !== (body && body.endpoint));
  await env.BUNNY_KV.put(SUBS, JSON.stringify(subs));
  return new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } });
}
