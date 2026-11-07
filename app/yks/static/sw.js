// Service worker: uygulama dosyalarını önbelleğe alır (internetsiz açılış), API okumalarını
// "önce ağ, yoksa son kayıt" ile sunar ve galeriden "Paylaş" ile gelen görseli yakalar.
const VERSION = 'v2';
const SHELL = `yks-shell-${VERSION}`;
const DATA = 'yks-data';
const FILES = [
  '/', '/manifest.webmanifest', '/static/css/app.css', '/static/js/app.js',
  '/static/js/api.js', '/static/js/ui.js', '/static/js/picker.js', '/static/js/student.js', '/static/js/mistake.js',
  '/static/js/exam.js', '/static/js/history.js', '/static/js/coach.js', '/static/js/chart.js', '/static/js/week.js', '/static/js/menu.js',
  '/static/icons/icon-192.png', '/static/icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('yks-shell-') && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  // Galeriden paylaşılan görsel -> hata ekleme ekranı
  if (url.pathname === '/paylas' && e.request.method === 'POST') {
    e.respondWith((async () => {
      try {
        const form = await e.request.formData();
        const file = form.getAll('gorsel').find((f) => f && f.type && f.type.startsWith('image/'));
        if (file) {
          const cache = await caches.open('paylasim');
          await cache.put('/paylasim-gorsel', new Response(file, { headers: { 'Content-Type': file.type } }));
        }
      } catch (_) { /* görsel yoksa yine de ekranı aç */ }
      return Response.redirect('/#/hata-ekle?paylasim=1', 303);
    })());
    return;
  }

  if (e.request.method !== 'GET') return;

  if (url.pathname.startsWith('/api/')) {
    if (url.pathname.startsWith('/api/disari/')) return;
    // önce ağ; internet yoksa son başarılı cevap
    e.respondWith((async () => {
      try {
        const r = await fetch(e.request);
        if (r.ok) (await caches.open(DATA)).put(e.request, r.clone());
        return r;
      } catch (err) {
        const hit = await caches.match(e.request);
        if (hit) return hit;
        throw err;
      }
    })());
    return;
  }

  // uygulama dosyaları: önce ağ (güncel kalsın), yoksa önbellek
  e.respondWith((async () => {
    try {
      const r = await fetch(e.request);
      if (r.ok) (await caches.open(SHELL)).put(e.request, r.clone());
      return r;
    } catch (err) {
      const hit = await caches.match(e.request, { ignoreSearch: url.pathname !== '/' });
      if (hit) return hit;
      if (e.request.mode === 'navigate') return caches.match('/');
      throw err;
    }
  })());
});
