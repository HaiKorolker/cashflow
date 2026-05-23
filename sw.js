'use strict';

const CACHE = 'cashflow-v11';
const ASSETS = [
  './index.html',
  './css/style.css',
  './js/db.js',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  // אל תיירט בקשות לרשת המקומית (סנכרון WiFi) — תן לדפדפן לטפל בהן ישירות
  try {
    const hostname = new URL(e.request.url).hostname;
    if (hostname !== self.location.hostname &&
        !hostname.includes('jsdelivr.net') &&
        !hostname.includes('cdnjs.cloudflare.com')) return;
  } catch { return; }

  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if (res.ok && (e.request.url.includes('cdn.jsdelivr.net') || e.request.url.includes('cdnjs.cloudflare.com'))) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }))
  );
});
