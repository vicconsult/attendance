const CACHE = 'attendance-server23-mysql-shell';
const SHELL = [
  '/index.html?v=20260818-23',
  '/guide.html?v=20260818-23',
  '/privacy.html?v=20260818-23',
  '/assets/styles.css?v=20260818-23',
  '/assets/app.js?v=20260818-23',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/manifest.webmanifest?v=20260818-23'
];
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key)))).then(() => caches.open(CACHE)).then(cache => cache.addAll(SHELL)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/checkin') return;
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request, {cache:'no-store'}).then(response => {
    if (response && response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
    return response;
  }).catch(async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    if (event.request.mode === 'navigate') return caches.match('/index.html?v=20260818-23');
    throw new Error('Offline and resource not cached');
  }));
});
