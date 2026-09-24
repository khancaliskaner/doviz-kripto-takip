/* Service worker: (1) sunucu alarmı için Web Push bildirimi, (2) çevrimdışı açılabilen uygulama kabuğu.
   Sürüm, index.html'deki ?v= numarasıyla aynı tutulur (testte karşılaştırılıyor). */
'use strict';

const VERSION = '10';
const CACHE = 'dkt-shell-v' + VERSION;

// Alarm sunucusu başka bir adresteyse js/serversync.js bunu "sw.js?server=..." ile iletir
const SERVER = new URL(self.location.href).searchParams.get('server') || '';

const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'css/style.css',
  'js/config.js', 'js/storage.js', 'js/alarms.js', 'js/theme.js', 'js/api.js', 'js/ui.js',
  'js/chartview.js', 'js/alarmui.js', 'js/serversync.js', 'js/search.js', 'js/pwa.js', 'js/app.js',
  'icons/icon-192.png', 'icons/icon-512.png'
];

/* --- Yaşam döngüsü --- */

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // Tek tek ekliyoruz: addAll bir dosya bile yoksa tümünü reddeder ve kurulum çöker
      return Promise.all(SHELL.map(function (url) {
        return cache.add(new Request(url, { cache: 'reload' })).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
                             .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* --- Önbellek: önce ağ, olmazsa önbellek ---
   "Önce önbellek" yapsaydık geliştirirken hep eski dosyayı görürdük (daha önce yaşadığımız sorun).
   Fiyat API'lerine (CoinGecko, Frankfurter) ve alarm sunucusunun /api/ yoluna dokunmuyoruz:
   çevrimdışıyken uygulamanın kendi hata mesajları doğru çalışsın, bayat fiyat gösterilmesin. */

self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin && url.pathname.indexOf('/api/') === 0) return;

  if (sameOrigin) {
    event.respondWith(networkFirst(req));
  } else if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(cacheFirst(req));      // Chart.js: sürümü URL'de sabit, değişmez
  }
});

function networkFirst(req) {
  return fetch(req, { cache: 'no-cache' }).then(function (res) {
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
    }
    return res;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      // Adres çubuğundan açılan sayfa çevrimdışıysa ana sayfayı ver
      if (req.mode === 'navigate') return caches.match('index.html', { ignoreSearch: true });
      return Response.error();
    });
  });
}

function cacheFirst(req) {
  return caches.match(req).then(function (hit) {
    if (hit) return hit;
    return fetch(req).then(function (res) {
      if (res && (res.ok || res.type === 'opaque')) {
        const copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    });
  });
}

/* --- Push: sunucu boş bir "dürtme" gönderir, metni biz sunucudan alırız --- */

self.addEventListener('push', function (event) {
  event.waitUntil(handlePush());
});

function handlePush() {
  return Promise.all([
    self.registration.pushManager.getSubscription(),
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  ]).then(function (res) {
    const sub = res[0];
    const clients = res[1];

    // Açık sayfa varsa hemen senkron etsin (uyarı şeridini kendisi gösterir)
    clients.forEach(function (c) { c.postMessage({ type: 'alarm-push' }); });
    const visible = clients.some(function (c) { return c.visibilityState === 'visible'; });

    return takeAlerts(sub).then(function (alerts) {
      // Sayfa açık ve görünürse ayrıca bildirim göstermeye gerek yok
      if (visible) return;

      if (!alerts.length) {
        // Tarayıcılar her push için bir bildirim bekler; metni alamadıysak genel bir uyarı göster
        return self.registration.showNotification('🔔 Fiyat alarmı', {
          body: 'Bir alarmın tetiklendi. Ayrıntı için uygulamayı aç.',
          tag: 'alarm-generic', icon: 'icons/icon-192.png', data: { url: './' }
        });
      }
      return Promise.all(alerts.map(function (a) {
        // tag = alarm kimliği: sayfa da aynı etiketle bildirim gösterirse ikisi tek bildirime iner
        return self.registration.showNotification(a.title || '🔔 Fiyat alarmı', {
          body: a.body, tag: a.id, icon: 'icons/icon-192.png', data: { url: './' }
        });
      }));
    });
  });
}

function takeAlerts(sub) {
  if (!sub) return Promise.resolve([]);
  return fetch(SERVER + '/api/alerts/take', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint })
  }).then(function (r) { return r.ok ? r.json() : { alerts: [] }; })
    .then(function (j) { return j.alerts || []; })
    .catch(function () { return []; });
}

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || './';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clients) {
      for (let i = 0; i < clients.length; i++) {
        if ('focus' in clients[i]) return clients[i].focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
