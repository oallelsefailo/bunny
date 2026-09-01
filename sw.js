/* Penny & Lolo service worker: instant offline open + push reminders */
const VERSION = 'bunny-v1';
const SHELL = [
  './', 'index.html', 'app.js', 'config.js', 'manifest.webmanifest',
  'images/penny.webp', 'images/lolo.webp',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  const isCode = /(?:\/|index\.html|app\.js|config\.js)$/.test(url.pathname);
  if (isCode) {
    // network-first so updates arrive; cache is the offline fallback
    e.respondWith(
      fetch(e.request).then(r => {
        const copy = r.clone();
        caches.open(VERSION).then(c => c.put(e.request, copy));
        return r;
      }).catch(() => caches.match(e.request, { ignoreSearch: true }))
    );
  } else {
    // cache-first for images/icons/fonts
    e.respondWith(
      caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
        const copy = r.clone();
        caches.open(VERSION).then(c => c.put(e.request, copy));
        return r;
      }))
    );
  }
});

/* ---------- push reminders ---------- */
function idbGet(key){
  return new Promise(res => {
    try {
      const rq = indexedDB.open('bunny-kv', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
      rq.onsuccess = () => {
        const g = rq.result.transaction('kv').objectStore('kv').get(key);
        g.onsuccess = () => res(g.result); g.onerror = () => res(null);
      };
      rq.onerror = () => res(null);
    } catch (e) { res(null); }
  });
}
async function dueText(){
  try {
    const key = await idbGet('familyKey');
    if (!key) return null;
    const r = await fetch('/api/data', { headers: { 'x-bunny-key': key } });
    const db = await r.json();
    if (!db || !db.bunnies) return null;
    const today = new Date().toLocaleDateString('sv');
    const out = [];
    for (const id of Object.keys(db.bunnies)) {
      const b = db.bunnies[id];
      for (const rt of (b.routines || [])) if (rt.nextDue && rt.nextDue <= today) out.push(b.name + ': ' + rt.name);
      for (const a of (b.appts || [])) if (!a.done && a.date === today) out.push(b.name + ': ' + a.title);
    }
    return out.length ? out.join(' · ') : null;
  } catch (e) { return null; }
}
self.addEventListener('push', e => {
  e.waitUntil((async () => {
    const body = (await dueText()) || 'Something on the care plan is due today. Come see 💕';
    await self.registration.showNotification('Penny & Lolo 🐰', {
      body,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: 'bunny-due',
    });
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(ws => ws.length ? ws[0].focus() : clients.openWindow('./'))
  );
});
