// PÉNIEL — Service Worker : rend l'app installable et utilisable hors-ligne.
// Stratégie : "réseau d'abord" pour la page (mises à jour immédiates quand en
// ligne, cache en secours hors-ligne) ; "cache d'abord" pour les fichiers
// statiques ; on ne touche jamais aux appels API (proxy IA, Firebase).
const CACHE = 'peniel-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './peniel-aigle.png',
  'https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore-compat.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(ASSETS.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return; // POST (IA, Firestore) : réseau direct, jamais de cache
  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // Appels dynamiques à ne jamais mettre en cache
  if (url.hostname.includes('onrender.com') ||
      url.hostname.includes('googleapis.com') ||
      url.hostname.includes('firestore') ||
      url.hostname.includes('firebaseio') ||
      url.hostname.includes('identitytoolkit')) {
    return; // laisse passer au réseau normalement
  }

  // Page / navigation : réseau d'abord, cache en secours (hors-ligne)
  if (req.mode === 'navigate' ||
      (url.origin === self.location.origin && url.pathname.endsWith('/')) ||
      (url.origin === self.location.origin && url.pathname.endsWith('index.html'))) {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // Reste (image, scripts CDN) : cache d'abord, réseau en secours
  e.respondWith(
    caches.match(req).then((cached) =>
      cached || fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })
    )
  );
});
