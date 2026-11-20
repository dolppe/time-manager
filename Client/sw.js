const CACHE = 'time-manager-v1';
const FILES = ['./','./index.html','./style.css','./app.js','./manifest.webmanifest','./assets/sticker-diary/theme.css','./assets/sticker-diary/Jua-Regular.ttf','./assets/sticker-diary/egg.png','./assets/sticker-diary/axolotl.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('time-manager-') && key !== CACHE).map(key => caches.delete(key))))));
self.addEventListener('fetch', event => { if (event.request.method === 'GET') event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request))); });
