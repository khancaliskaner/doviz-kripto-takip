'use strict';
/* Web Push için gereken en küçük parça, dış paket yok (yalnızca Node'un crypto'su).

   Yük (payload) GÖNDERİLMİYOR: sunucu tarayıcının push servisine boş bir "dürtme" atıyor
   (VAPID imzalı), service worker uyanınca bildirim metnini kendi sunucumuzdan alıyor. Bu yüzden
   RFC 8291 yük şifrelemesi gerekmiyor; gerekli olan tek kriptografi VAPID (RFC 8292) imzası. */

const crypto = require('crypto');

/* SSRF koruması: sunucu, istemcinin verdiği URL'ye HTTP isteği atıyor. Rastgele bir adres
   (ör. yerel ağdaki bir cihaz) kabul edilirse sunucu saldırganın vekili olur. Bu yüzden yalnızca
   bilinen tarayıcı push servislerine izin veriliyor. */
const ALLOWED_HOSTS = [
  /^fcm\.googleapis\.com$/,                      // Chrome, Edge, Android
  /^android\.googleapis\.com$/,                  // eski Chrome
  /^updates\.push\.services\.mozilla\.com$/,     // Firefox
  /^[a-z0-9.-]+\.push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/,                     // Safari
  /^[a-z0-9.-]+\.push\.apple\.com$/,
  /^[a-z0-9.-]+\.notify\.windows\.com$/          // Edge (WNS)
];

function isAllowedEndpoint(endpoint) {
  let u;
  try { u = new URL(endpoint); } catch (e) { return false; }
  if (u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;
  if (u.port && u.port !== '443') return false;
  return ALLOWED_HOSTS.some(function (re) { return re.test(u.hostname); });
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

/* Bir kez üretilir, state.json'da saklanır. publicKey tarayıcının subscribe() çağrısına verilen
   65 baytlık sıkıştırılmamış P-256 noktası (base64url); privateJwk sunucuda kalır. */
function generateVapidKeys() {
  const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pub = pair.publicKey.export({ format: 'jwk' });
  const priv = pair.privateKey.export({ format: 'jwk' });
  const raw = Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(pub.x, 'base64url'),
    Buffer.from(pub.y, 'base64url')
  ]);
  return { publicKey: b64url(raw), privateJwk: priv };
}

function vapidJwt(keys, audience, subject, nowSec) {
  const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64url(JSON.stringify({ aud: audience, exp: nowSec + 12 * 3600, sub: subject }));
  const data = header + '.' + claims;
  const key = crypto.createPrivateKey({ key: keys.privateJwk, format: 'jwk' });
  // ES256 = ECDSA P-256 + SHA-256, imza ham r||s (64 bayt) biçiminde (DER değil)
  const sig = crypto.sign('sha256', Buffer.from(data), { key: key, dsaEncoding: 'ieee-p1363' });
  return data + '.' + b64url(sig);
}

function vapidHeaders(keys, endpoint, subject, nowSec) {
  const audience = new URL(endpoint).origin;
  return {
    Authorization: 'vapid t=' + vapidJwt(keys, audience, subject, nowSec) + ', k=' + keys.publicKey,
    TTL: '86400',        // push servisi cihaz kapalıysa 1 gün saklasın
    Urgency: 'high'
  };
}

function defaultPost(url, headers) {
  return fetch(url, { method: 'POST', headers: headers, signal: AbortSignal.timeout(15000) })
    .then(function (res) { return { status: res.status }; });
}

/* Dönen: { status, gone } — gone=true ise abonelik artık geçersiz (404/410), silinmeli. */
function sendPush(subscription, keys, opts) {
  opts = opts || {};
  if (!subscription || !isAllowedEndpoint(subscription.endpoint)) {
    return Promise.resolve({ status: 0, gone: true, error: 'izin verilmeyen uç nokta' });
  }
  const now = opts.now ? opts.now() : Date.now();
  const headers = vapidHeaders(keys, subscription.endpoint, opts.subject || 'mailto:alarm@example.com',
                               Math.floor(now / 1000));
  const post = opts.post || defaultPost;

  return post(subscription.endpoint, headers).then(function (res) {
    return { status: res.status, gone: res.status === 404 || res.status === 410 };
  }).catch(function (err) {
    return { status: 0, gone: false, error: err.message };
  });
}

module.exports = {
  isAllowedEndpoint: isAllowedEndpoint,
  generateVapidKeys: generateVapidKeys,
  vapidJwt: vapidJwt,
  vapidHeaders: vapidHeaders,
  sendPush: sendPush
};
