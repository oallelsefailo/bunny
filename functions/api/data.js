// Cloudflare Pages Function: stores the whole tracker as one JSON blob in KV.
// Setup (see README.md): create a KV namespace, bind it as BUNNY_KV,
// and set an environment variable BUNNY_KEY (the "family password").
const KEY = 'data';

function authorized(request, env) {
  return env.BUNNY_KEY && request.headers.get('x-bunny-key') === env.BUNNY_KEY;
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
  await env.BUNNY_KV.put(KEY, body);
  return new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } });
}
