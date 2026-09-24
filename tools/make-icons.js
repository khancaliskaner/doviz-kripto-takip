'use strict';
/* Uygulama simgelerini (icons/*.png) üretir; görsel araç ya da dış paket gerekmez.
   Çalıştırma: node tools/make-icons.js   (Node yoksa: baslat-sunucu.bat içindeki VS Code yöntemi)
   Tasarım: koyu zemin, yükselen yeşil çizgi grafik ve uçta mavi nokta. */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BG = [15, 18, 22];
const LINE = [62, 207, 142];
const DOT = [79, 156, 249];
const BASE = [42, 50, 60];

/* Şekil koordinatları 0..1. SCALE < 1: içerik ortadan küçültülür; böylece "maskable" (yuvarlak/
   kare kırpılan) simgede en dıştaki nokta bile kırpılmaz (güvenli alan = merkezdeki %80). */
const SCALE = 0.88;
const POINTS = [[0.22, 0.68], [0.38, 0.52], [0.50, 0.60], [0.66, 0.38], [0.78, 0.30]];
const THICK = 0.075;
const DOT_R = 0.065;
const BASE_Y = 0.78;

function place(p) {
  return [0.5 + (p[0] - 0.5) * SCALE, 0.5 + (p[1] - 0.5) * SCALE];
}

// Nokta ile doğru parçası arasındaki uzaklık (yuvarlak uçlu kalın çizgi = "kapsül")
function distSeg(px, py, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - a[0]) * dx + (py - a[1]) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

function shade(x, y) {
  const pts = POINTS.map(place);
  const half = (THICK * SCALE) / 2;

  // Üstte olan önce: uç noktası, çizgi, sonra taban çizgisi, en altta zemin
  const end = pts[pts.length - 1];
  if (Math.hypot(x - end[0], y - end[1]) <= DOT_R * SCALE) return DOT;

  for (let i = 0; i < pts.length - 1; i++) {
    if (distSeg(x, y, pts[i], pts[i + 1]) <= half) return LINE;
  }

  const by = place([0, BASE_Y])[1];
  const bx0 = place([0.22, 0])[0], bx1 = place([0.78, 0])[0];
  if (Math.abs(y - by) <= 0.006 * SCALE && x >= bx0 && x <= bx1) return BASE;

  return BG;
}

// n x n alt örnekleme: kenarlar yumuşak (anti-alias) çıkar
function render(size, sub) {
  const px = Buffer.alloc(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let r = 0, g = 0, b = 0;
      for (let sj = 0; sj < sub; sj++) {
        for (let si = 0; si < sub; si++) {
          const c = shade((i + (si + 0.5) / sub) / size, (j + (sj + 0.5) / sub) / size);
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const n = sub * sub, o = (j * size + i) * 4;
      px[o] = Math.round(r / n); px[o + 1] = Math.round(g / n); px[o + 2] = Math.round(b / n); px[o + 3] = 255;
    }
  }
  return px;
}

/* --- PNG kodlayıcı (RGBA, 8 bit) --- */

const CRC_TABLE = (function () {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;    // bit derinliği
  ihdr[9] = 6;    // renk türü: RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;                       // süzgeç: yok
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* --- Çıktılar --- */

const OUT = path.join(__dirname, '..', 'icons');
const FILES = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['icon-maskable-512.png', 512],     // aynı çizim; SCALE zaten güvenli alana sığdırıyor
  ['apple-touch-icon.png', 180]       // iOS ana ekran simgesi
];

if (require.main === module) {
  fs.mkdirSync(OUT, { recursive: true });
  FILES.forEach(function (f) {
    const png = encodePng(f[1], render(f[1], 4));
    fs.writeFileSync(path.join(OUT, f[0]), png);
    console.log(f[0] + '  ' + f[1] + 'x' + f[1] + '  ' + png.length + ' bayt');
  });
}

module.exports = { render: render, encodePng: encodePng, crc32: crc32 };
