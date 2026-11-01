// Offline memory for the presentation (service worker). deploy.py fills in VERSION.
// - Pages (slides, phone remote, practice): try the network first (4 s), else the saved copy.
// - Pictures, videos, scripts, fonts: the saved copy first, else the network (then saved).
// - Video range requests: answered from the saved copy when there is one (so clips play on bad wifi), else the network.
// A new VERSION (every publish) clears the old saved copies, so updates always arrive.
const VERSION = 'hny-final4-11012256';
const CORE = ['./', 'index.html', 'remote.html', 'remote2.html', 'practice.html', 'remote-host.js', 'remote-host2.js', 'remote-host.css',
  'vendor/mqtt.min.js', 'vendor/ntfy-link.js', 'vendor/qrcode.js', 'vendor/inter/inter.css'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.allSettled(CORE.map(u => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// The slides page sends the list of every picture and video it uses; save any that are not saved yet.
self.addEventListener('message', e => {
  const list = e.data && e.data.cache;
  if (!Array.isArray(list)) return;
  e.waitUntil(caches.open(VERSION).then(c => Promise.allSettled(list.map(u =>
    c.match(u, { ignoreSearch: true }).then(hit => hit || fetch(u).then(res => { if (res.ok && res.status === 200) return c.put(new URL(u, self.location).pathname, res); })))))); 
});

function isPage(req, url) {
  return req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html');
}
function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;            // ntfy, relays, etc.: not touched
  if (req.headers.has('range')) {                              // video: play from the saved copy if there is one
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const hit = await cache.match(url.origin + url.pathname);
      if (!hit) return fetch(req);
      const buf = await hit.arrayBuffer(), total = buf.byteLength;
      const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range')) || [];
      let start = m[1] ? +m[1] : 0, end = m[2] ? +m[2] : total - 1;
      if (!m[1] && m[2]) { start = Math.max(0, total - +m[2]); end = total - 1; }
      end = Math.min(end, total - 1);
      if (start >= total || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + total } });
      return new Response(buf.slice(start, end + 1), { status: 206, headers: {
        'Content-Type': hit.headers.get('Content-Type') || 'video/mp4', 'Content-Length': String(end - start + 1),
        'Content-Range': 'bytes ' + start + '-' + end + '/' + total, 'Accept-Ranges': 'bytes' } });
    })());
    return;
  }
  if (isPage(req, url)) {
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try {
        const res = await Promise.race([fetch(req), timeout(4000)]);
        if (res && res.ok) cache.put(url.pathname.endsWith('/') ? './' : req, res.clone()).catch(() => {});
        return res;
      } catch (err) {
        const hit = await cache.match(req, { ignoreSearch: true }) || (url.pathname.endsWith('/') ? await cache.match('./') : null);
        if (hit) return hit;
        return fetch(req);
      }
    })());
    return;
  }
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(req);
    if (res && res.ok && res.status === 200) cache.put(url.origin + url.pathname, res.clone()).catch(() => {});
    return res;
  })());
});
