'use strict';
/* Sekme kapalıyken de çalışan fiyat alarmı sunucusu. Dış paket yok; Node 18+ (fetch, crypto).

   Yaptığı üç şey:
     1. Uygulamanın dosyalarını sunar (index.html, css/, js/, sw.js, manifest, icons/).
     2. İstemcinin alarm listesini saklar (POST /api/sync) ve her dakika fiyatları sorgulayıp
        koşulu sağlayan alarmları tetikler.
     3. Tetiklenen alarm için tarayıcının push servisine (FCM / Mozilla / Apple / WNS) boş bir
        VAPID imzalı "dürtme" gönderir; service worker uyanıp bildirim metnini
        POST /api/alerts/take ile bu sunucudan alır.

   Çalıştırma: baslat-sunucu.bat  (ya da: node server/server.js)
   Ortam değişkenleri: PORT (8787), HOST (127.0.0.1), POLL_MS (60000),
                       ALLOW_ORIGIN (uygulama başka adreste yayınlanmışsa o adres), VAPID_SUBJECT */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const webpush = require('./webpush');

const MAX_BODY = 256 * 1024;
const MAX_DEVICES = 20;
const MAX_ALARMS = 100;
const MAX_ALERTS = 50;

// Yalnızca bunlar dışarıya sunulur: server/ (özel anahtar burada) ve .md dosyaları asla
const STATIC_ALLOW = ['index.html', 'sw.js', 'manifest.webmanifest', 'css', 'js', 'icons'];
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

/* --- Saf yardımcılar (istemcideki js/alarms.js ile aynı kurallar; test ikisini karşılaştırır) --- */

function isHit(alarm, price) {
  return alarm.direction === 'above' ? price >= alarm.target : price <= alarm.target;
}

function decimalsFor(value) {
  const v = Math.abs(value);
  if (v >= 1000) return 0;
  if (v >= 10) return 2;
  if (v >= 0.01) return 4;
  return 8;
}

function money(value) {
  const d = decimalsFor(value);
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency', currency: 'TRY', minimumFractionDigits: d, maximumFractionDigits: d
  }).format(value);
}

function alertText(alarm, price) {
  const did = alarm.direction === 'above' ? 'yükseldi' : 'düştü';
  return alarm.title + ': ' + money(alarm.target) + ' seviyesine ' + did + '. Şu an ' + money(price);
}

/* İstemciden gelen her alarm doğrulanır: sunucu bu değerlerle URL kuruyor ve dosyaya yazıyor. */
function sanitizeAlarm(a) {
  if (!a || typeof a !== 'object') return null;
  const okId = typeof a.id === 'string' && /^[\w-]{1,64}$/.test(a.id);
  const okType = a.type === 'fx' || a.type === 'crypto';
  const okItem = typeof a.itemId === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(a.itemId);
  const okDir = a.direction === 'above' || a.direction === 'below';
  const okTarget = typeof a.target === 'number' && isFinite(a.target) && a.target > 0;
  if (!(okId && okType && okItem && okDir && okTarget)) return null;

  const num = function (v) { return typeof v === 'number' && isFinite(v) ? v : null; };
  return {
    id: a.id, type: a.type, itemId: a.itemId,
    title: String(a.title || a.itemId).slice(0, 120),
    direction: a.direction, target: a.target,
    createdAt: num(a.createdAt) || Date.now(),
    triggeredAt: num(a.triggeredAt), triggeredPrice: num(a.triggeredPrice)
  };
}

function uniq(list) {
  return list.filter(function (v, i) { return list.indexOf(v) === i; });
}

function defaultFetchJson(url) {
  return fetch(url, { signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json' } })
    .then(function (res) {
      if (!res.ok) {
        const err = new Error('HTTP ' + res.status + ' <- ' + url.slice(0, 70));
        err.status = res.status;
        err.retryAfter = Number(res.headers.get('retry-after')) || 0;
        throw err;
      }
      return res.json();
    });
}

function createApp(options) {
  const o = Object.assign({
    dataDir: path.join(__dirname, 'data'),
    staticRoot: path.join(__dirname, '..'),
    host: '127.0.0.1',
    port: 8787,
    pollMs: 60000,
    allowOrigin: '',
    vapidSubject: 'mailto:alarm@example.com',
    now: function () { return Date.now(); },
    fetchJson: defaultFetchJson,
    pushPost: undefined,      // yoksa webpush.defaultPost (gerçek HTTP)
    log: function () { console.log.apply(console, [new Date().toISOString()].concat([].slice.call(arguments))); }
  }, options || {});

  const stateFile = path.join(o.dataDir, 'state.json');
  let state = { vapid: null, devices: {} };
  let server = null;
  let timer = null;
  let polling = false;
  let backoffUntil = 0;

  /* --- Saklama --- */

  function saveState() {
    fs.mkdirSync(o.dataDir, { recursive: true });
    const tmp = stateFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, stateFile);     // yarım yazılmış dosya bırakmamak için
  }

  function loadState() {
    try {
      state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    } catch (e) {
      state = { vapid: null, devices: {} };
    }
    state.devices = state.devices || {};
    if (!state.vapid) {
      state.vapid = webpush.generateVapidKeys();
      saveState();
      o.log('VAPID anahtarı üretildi (server/data/state.json).');
    }
  }

  function deviceId(endpoint) {
    return crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 32);
  }

  function findDevice(endpoint) {
    return typeof endpoint === 'string' ? state.devices[deviceId(endpoint)] : undefined;
  }

  /* --- Birleştirme: istemci alarmın VARLIĞINA, sunucu TETİKLENMİŞ olmasına yetkili --- */

  function mergeAlarms(device, clientList) {
    const known = {};
    device.alarms.forEach(function (a) { known[a.id] = a; });

    const serverTriggered = [];
    const merged = clientList.map(function (c) {
      const s = known[c.id];
      if (s && s.triggeredAt) {
        // Sunucu tetiklemiş; istemci henüz bilmiyorsa ona haber ver
        if (!c.triggeredAt) serverTriggered.push(s.id);
        return s;
      }
      return c;    // ikisi de aktif (ya da yeni / istemci tetiklemiş)
    });

    device.alarms = merged.slice(0, MAX_ALARMS);
    return { alarms: device.alarms, serverTriggered: serverTriggered };
  }

  /* --- Fiyat sorgulama ve tetikleme --- */

  function fetchCryptoPrices(ids) {
    const url = 'https://api.coingecko.com/api/v3/simple/price?ids=' + ids.join(',') + '&vs_currencies=try';
    return o.fetchJson(url).then(function (data) {
      const out = {};
      ids.forEach(function (id) { out[id] = data && data[id] && data[id].try; });
      return out;
    });
  }

  function fetchFxPrices(codes) {
    const url = 'https://api.frankfurter.dev/v1/latest?base=TRY&symbols=' + codes.join(',');
    return o.fetchJson(url).then(function (data) {
      const out = {};
      codes.forEach(function (c) {
        const r = data && data.rates && data.rates[c];
        out[c] = r ? 1 / r : null;     // TRY bazlı kurun tersi = 1 birim kaç TL
      });
      return out;
    });
  }

  function notifyDevice(device) {
    return webpush.sendPush(device.subscription, state.vapid, {
      subject: o.vapidSubject, now: o.now, post: o.pushPost
    }).then(function (res) {
      if (res.gone) {
        delete state.devices[deviceId(device.subscription.endpoint)];
        saveState();
        o.log('Geçersiz abonelik silindi (' + res.status + ').');
      } else if (res.status >= 400 || res.status === 0) {
        o.log('Push gönderilemedi: ' + res.status + (res.error ? ' ' + res.error : ''));
      }
      return res;
    });
  }

  function pollOnce() {
    if (polling) return Promise.resolve({ skipped: 'busy' });
    if (o.now() < backoffUntil) return Promise.resolve({ skipped: 'backoff' });

    const active = [];
    Object.keys(state.devices).forEach(function (id) {
      const d = state.devices[id];
      d.alarms.forEach(function (a) { if (!a.triggeredAt) active.push({ device: d, alarm: a }); });
    });
    if (!active.length) return Promise.resolve({ skipped: 'no-alarms' });

    const cryptoIds = uniq(active.filter(function (x) { return x.alarm.type === 'crypto'; })
                                 .map(function (x) { return x.alarm.itemId; }));
    const fxCodes = uniq(active.filter(function (x) { return x.alarm.type === 'fx'; })
                               .map(function (x) { return x.alarm.itemId; }));

    polling = true;
    return Promise.all([
      cryptoIds.length ? fetchCryptoPrices(cryptoIds) : {},
      fxCodes.length ? fetchFxPrices(fxCodes) : {}
    ]).then(function (res) {
      const prices = { crypto: res[0], fx: res[1] };
      const now = o.now();
      const touched = [];

      active.forEach(function (x) {
        const price = prices[x.alarm.type][x.alarm.itemId];
        if (typeof price !== 'number' || !isFinite(price)) return;
        if (!isHit(x.alarm, price)) return;

        x.alarm.triggeredAt = now;
        x.alarm.triggeredPrice = price;
        x.device.alerts.push({ id: x.alarm.id, title: '🔔 Fiyat alarmı', body: alertText(x.alarm, price), at: now });
        if (x.device.alerts.length > MAX_ALERTS) x.device.alerts.shift();
        if (touched.indexOf(x.device) === -1) touched.push(x.device);
      });

      if (!touched.length) return { fired: 0 };
      saveState();
      o.log(touched.length + ' cihaza alarm bildirimi gönderiliyor.');
      return Promise.all(touched.map(notifyDevice)).then(function () { return { fired: touched.length }; });
    }).catch(function (err) {
      // 429: CoinGecko limiti. Bir sonraki turu erteleyip limiti daha da zorlamıyoruz.
      if (err.status === 429) backoffUntil = o.now() + Math.max(err.retryAfter || 0, 60) * 1000;
      o.log('Fiyat sorgulanamadı: ' + err.message);
      return { error: err.message };
    }).then(function (r) { polling = false; return r; });
  }

  /* --- HTTP --- */

  function send(res, status, body, extra) {
    const headers = Object.assign({ 'Cache-Control': 'no-store' }, extra || {});
    if (body === null) {
      res.writeHead(status, headers);
      res.end();
      return;
    }
    headers['Content-Type'] = 'application/json; charset=utf-8';
    res.writeHead(status, headers);
    res.end(JSON.stringify(body));
  }

  /* Tarayıcı Origin başlığı gönderiyorsa aynı sunucudan ya da ALLOW_ORIGIN'den gelmeli.
     Dönen: false (reddet) | {} (başlık ekleme) | CORS başlıkları */
  function corsFor(req) {
    const origin = req.headers.origin;
    if (!origin) return {};
    let sameHost = false;
    try { sameHost = new URL(origin).host === req.headers.host; } catch (e) { return false; }
    if (sameHost) return {};
    if (o.allowOrigin && origin === o.allowOrigin) {
      return {
        'Access-Control-Allow-Origin': origin, 'Vary': 'Origin',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600'
      };
    }
    return false;
  }

  function readJson(req) {
    return new Promise(function (resolve, reject) {
      let size = 0;
      let tooBig = false;
      const chunks = [];
      req.on('data', function (c) {
        if (tooBig) return;           // fazlasını okuyup atıyoruz, belleğe yığmıyoruz
        size += c.length;
        if (size > MAX_BODY) {
          tooBig = true;
          chunks.length = 0;
          // Bağlantıyı yanıtsız kesmek yerine 413 yazıp kapatıyoruz (Connection: close aşağıda)
          reject(Object.assign(new Error('gövde çok büyük'), { status: 413 }));
          return;
        }
        chunks.push(c);
      });
      req.on('end', function () {
        if (tooBig) return;
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
        catch (e) { reject(Object.assign(new Error('geçersiz JSON'), { status: 400 })); }
      });
      req.on('error', reject);
    });
  }

  function handleApi(req, res, p) {
    const cors = corsFor(req);
    if (cors === false) return send(res, 403, { error: 'origin izinli değil' });
    if (req.method === 'OPTIONS') return send(res, 204, null, cors);

    if (req.method === 'GET' && p === '/api/health') return send(res, 200, { ok: true, push: true }, cors);
    if (req.method === 'GET' && p === '/api/push/key') return send(res, 200, { publicKey: state.vapid.publicKey }, cors);
    if (req.method !== 'POST') return send(res, 404, { error: 'yok' }, cors);

    return readJson(req).then(function (parsed) {
      // "null", "5" gibi geçerli ama nesne olmayan JSON'lar alan okurken patlamasın
      const body = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};

      if (p === '/api/push/subscribe') {
        const sub = body.subscription;
        if (!sub || !webpush.isAllowedEndpoint(sub.endpoint)) {
          return send(res, 400, { error: 'geçersiz ya da izin verilmeyen push adresi' }, cors);
        }
        const id = deviceId(sub.endpoint);
        if (!state.devices[id] && Object.keys(state.devices).length >= MAX_DEVICES) {
          return send(res, 429, { error: 'cihaz sınırı doldu' }, cors);
        }
        const keys = sub.keys && typeof sub.keys === 'object' ? sub.keys : {};
        const existing = state.devices[id];
        state.devices[id] = {
          subscription: { endpoint: sub.endpoint, keys: { p256dh: String(keys.p256dh || ''), auth: String(keys.auth || '') } },
          alarms: existing ? existing.alarms : [],
          alerts: existing ? existing.alerts : [],
          createdAt: existing ? existing.createdAt : o.now()
        };
        saveState();
        return send(res, 200, { ok: true }, cors);
      }

      if (p === '/api/push/unsubscribe') {
        if (findDevice(body.endpoint)) {
          delete state.devices[deviceId(body.endpoint)];
          saveState();
        }
        return send(res, 200, { ok: true }, cors);
      }

      if (p === '/api/sync') {
        const device = findDevice(body.endpoint);
        if (!device) return send(res, 404, { error: 'abonelik yok, önce sunucu takibini aç' }, cors);
        const list = Array.isArray(body.alarms) ? body.alarms.slice(0, MAX_ALARMS).map(sanitizeAlarm).filter(Boolean) : [];
        const merged = mergeAlarms(device, list);
        saveState();
        return send(res, 200, merged, cors);
      }

      if (p === '/api/alerts/take') {
        const device = findDevice(body.endpoint);
        const alerts = device ? device.alerts : [];
        if (device && alerts.length) { device.alerts = []; saveState(); }
        return send(res, 200, { alerts: alerts }, cors);
      }

      return send(res, 404, { error: 'yok' }, cors);
    }).catch(function (err) {
      const extra = Object.assign({}, cors, err.status === 413 ? { Connection: 'close' } : {});
      send(res, err.status || 500, { error: err.message }, extra);
    });
  }

  function serveStatic(req, res, p) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'yöntem yok' });

    let rel;
    try { rel = decodeURIComponent(p); } catch (e) { return send(res, 400, { error: 'geçersiz yol' }); }
    if (rel === '/' || rel === '') rel = '/index.html';
    if (rel.indexOf('\0') !== -1 || rel.indexOf('\\') !== -1) return send(res, 400, { error: 'geçersiz yol' });

    const parts = rel.split('/').filter(Boolean);
    if (parts.some(function (s) { return s === '..' || s === '.'; })) return send(res, 400, { error: 'geçersiz yol' });
    if (STATIC_ALLOW.indexOf(parts[0]) === -1) return send(res, 404, { error: 'yok' });

    const file = path.join(o.staticRoot, parts.join(path.sep));
    if (file.indexOf(path.resolve(o.staticRoot)) !== 0) return send(res, 403, { error: 'yasak' });

    fs.readFile(file, function (err, data) {
      if (err) return send(res, 404, { error: 'yok' });
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        // Geliştirirken eski dosyaya takılmamak için her seferinde doğrulat (bkz. HTTP önbelleği notu)
        'Cache-Control': 'no-cache'
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    });
  }

  function handle(req, res) {
    const p = new URL(req.url, 'http://x').pathname;
    if (p.indexOf('/api/') === 0) return handleApi(req, res, p);
    return serveStatic(req, res, p);
  }

  /* --- Yaşam döngüsü --- */

  function start() {
    loadState();
    server = http.createServer(handle);
    return new Promise(function (resolve, reject) {
      server.once('error', reject);
      server.listen(o.port, o.host, function () {
        timer = setInterval(function () { pollOnce(); }, o.pollMs);
        if (timer.unref) timer.unref();
        resolve(server.address().port);
      });
    });
  }

  function stop() {
    if (timer) clearInterval(timer);
    return new Promise(function (resolve) { server ? server.close(resolve) : resolve(); });
  }

  return {
    start: start, stop: stop, pollOnce: pollOnce, loadState: loadState,
    getState: function () { return state; }
  };
}

module.exports = {
  createApp: createApp, isHit: isHit, money: money, alertText: alertText, sanitizeAlarm: sanitizeAlarm
};

if (require.main === module) {
  const env = process.env;
  const app = createApp({
    port: Number(env.PORT) || 8787,
    host: env.HOST || '127.0.0.1',
    pollMs: Number(env.POLL_MS) || 60000,
    allowOrigin: env.ALLOW_ORIGIN || '',
    vapidSubject: env.VAPID_SUBJECT || 'mailto:alarm@example.com'
  });
  app.start().then(function (port) {
    console.log('Alarm sunucusu hazır: http://' + (env.HOST || '127.0.0.1') + ':' + port + '/');
    console.log('Uygulamayı bu adresten aç (sunucu alarmı için gerekli). Durdurmak: Ctrl+C');
  }).catch(function (err) {
    console.error('Sunucu başlatılamadı: ' + err.message);
    process.exit(1);
  });
}
