# Döviz & Kripto Takip

**Canlı site:** https://khancaliskaner.github.io/doviz-kripto-takip/

Döviz kurlarını ([Frankfurter](https://frankfurter.dev)) ve kripto paraları ([CoinGecko](https://www.coingecko.com))
TL bazında canlı takip eden, API anahtarı gerektirmeyen bir web uygulaması. Build adımı yok: saf HTML/CSS/JS.

## Özellikler

- **Canlı takip:** en çok işlem gören 8 döviz, piyasa değerine göre ilk 10 kripto. Kripto 60 sn, döviz 10 dk'da bir yenilenir.
- **Favoriler:** yıldızla, yerinde tut (localStorage). ◀ ▶ düğmeleri veya sürükle-bırak ile sırala.
- **Grafik:** her kartta 📈 Grafik, son 7 gün (Chart.js).
- **Arama:** listede olmayan döviz / kripto paraları bul, favorilere ekle.
- **Fiyat alarmı:** her kartta 🔔 Alarm. Hedefe ulaşınca uyarı + bildirim. İstersen sunucu takibiyle sekme kapalıyken de.
- **Koyu / açık tema**, **telefona / bilgisayara uygulama olarak kurulabilir (PWA)**, çevrimdışı açılır.

## Çalıştırma

| Yol | Ne çalışır |
|---|---|
| `index.html`'e çift tıkla (`file://`) | Her şey, **PWA ve sunucu alarmı hariç** (tarayıcı `file://`'da service worker'a izin vermiyor) |
| VS Code Live Server (`http://127.0.0.1:5500`) | Her şey, sunucu alarmı hariç |
| `baslat-sunucu.bat` → `http://localhost:8787` | **Her şey**, sekme kapalıyken alarm dahil |
| Yayınlanmış adres (ör. GitHub Pages, HTTPS) | Her şey, sunucu alarmı hariç; telefonda kurulabilir |

Node kurulu olmasına gerek yok: `baslat-sunucu.bat` Node bulamazsa VS Code'un içindekini kullanır.

## Sunucu alarmı (sekme kapalıyken de)

Tarayıcı sekmesi kapalıyken bir sayfa fiyat kontrol edemez. Bunun için küçük bir sunucu (`server/`) var:

1. `baslat-sunucu.bat`'a çift tıkla ve **pencereyi açık bırak**.
2. Tarayıcıda `http://localhost:8787` adresini aç.
3. **Fiyat Alarmları** panelinde *Sunucuda takibi aç* → bildirim izni ver.

Alarmların sunucuda da izlenir; fiyat hedefe ulaşınca sunucu tarayıcının push servisine (Google/Mozilla/Apple/Microsoft) boş bir "dürtme" gönderir, tarayıcı uyanıp bildirimi gösterir.

**Sınırlar (bilerek böyle):**
- Sunucu senin bilgisayarında çalışır: **bilgisayar kapalıysa ya da uyuyorsa alarm gelmez.** Her zaman açık bir makinede (ev sunucusu, VPS) çalıştırırsan bu sınır kalkar.
- Masaüstünde bildirim gelmesi için tarayıcının açık olması (arka planda çalışıyor olması) gerekir.
- Telefonda push için sayfanın **HTTPS** üzerinden açılması gerekir; `http://192.168...` adreslerinde tarayıcı buna izin vermez. Bunun için sunucuyu HTTPS arkasına almak (ör. Cloudflare Tunnel, Tailscale) veya uygulamayı GitHub Pages'te yayınlayıp `js/config.js` içindeki `serverUrl`'e sunucunun HTTPS adresini yazmak gerekir (`ALLOW_ORIGIN` ortam değişkeniyle uygulamanın adresine izin ver).
- iPhone'da web push yalnızca uygulama **ana ekrana eklenmişse** çalışır (iOS 16.4+).
- Fiyat kaynağı CoinGecko ücretsiz planı: dakikada birkaç istek. Sunucu her dakika tek istek atar, `429` alırsa geri çekilir.

**Güvenlik notları:**
- Sunucu varsayılan olarak yalnızca bu bilgisayardan erişilir (`127.0.0.1`). `HOST=0.0.0.0` yaparsan yerel ağdaki herkes erişir; **kimlik doğrulama yoktur**, kişisel kullanım için tasarlandı.
- `server/data/state.json` sunucunun VAPID **özel anahtarını** ve abonelik adreslerini içerir. `.gitignore`'da, asla yayınlama.
- Sunucu istemcinin verdiği push adresine istek atar; SSRF'ye karşı yalnızca bilinen push servisleri (FCM, Mozilla, Apple, WNS) kabul edilir.
- Yalnızca `index.html`, `sw.js`, `manifest.webmanifest`, `css/`, `js/`, `icons/` dışarı sunulur; `server/` ve `.md` dosyaları sunulmaz.

Ortam değişkenleri: `PORT` (8787), `HOST` (127.0.0.1), `POLL_MS` (60000), `ALLOW_ORIGIN`, `VAPID_SUBJECT`.

## Telefona kurma (PWA)

- **Android / Chrome, Edge (masaüstü dahil):** başlıktaki **Uygulamayı yükle** düğmesi (tarayıcı uygun görünce çıkar).
- **iPhone / Safari:** Paylaş → **Ana Ekrana Ekle** (sayfa altında ipucu çıkar).
- Kurulum için sayfa HTTPS ya da `localhost` üzerinden açılmış olmalı.
- Çevrimdışıyken uygulama kabuğu açılır; fiyatlar çevrimdışıyken **gösterilmez** (bayat fiyat göstermemek için bilerek).

## Yayınlama (GitHub Pages)

Site tamamen statik olduğu için GitHub Pages'te çalışır (HTTPS, telefonda kurulabilir). Sunucu alarmı orada çalışmaz (sunucu kodu çalıştırılamaz); sayfa bunu algılayıp kendini "alarmlar yalnızca sayfa açıkken" moduna alır.

## Dosya yapısı

```
index.html            sayfa
sw.js                 service worker: çevrimdışı önbellek + push bildirimi
manifest.webmanifest  PWA bilgileri
baslat-sunucu.bat     alarm sunucusunu başlatır
css/style.css         tüm stiller (tema, telefon, PWA)
icons/                uygulama simgeleri (tools/make-icons.js üretir)
js/config.js          pariteler, adresler, yenileme aralıkları, anahtarlar
js/storage.js         favoriler (localStorage) ve sıralama
js/alarms.js          alarm mantığı: saklama, tetikleme, fiyat girdisini ayrıştırma
js/theme.js           koyu / açık tema
js/api.js             Frankfurter + CoinGecko istekleri
js/ui.js              biçimlendirme, kartlar, sürükle-bırak
js/chartview.js       7 günlük grafik penceresi
js/alarmui.js         alarm penceresi, alarm paneli, uyarılar
js/pwa.js             service worker kaydı, "yükle" düğmesi, çevrimdışı durumu
js/serversync.js      alarmları sunucuyla eşitler, push aboneliğini yönetir
js/search.js          arama kutusu
js/app.js             giriş noktası
server/server.js      alarm sunucusu (dış paket yok)
server/webpush.js     VAPID imzası + Web Push gönderimi
tools/make-icons.js   simge üretici
```

Betikler `index.html`'de sırayla yüklenir ve global nesnelerle (`CONFIG`, `API`, `UI`, `Alarms`…) haberleşir. ES module kullanılmadı: `file://` üzerinden tarayıcı module'leri engelliyor.

## Geliştirici notları

- **Önbellek sürümü:** bir dosyayı değiştirince `index.html` içindeki tüm `?v=N` etiketlerini **ve** `sw.js` içindeki `VERSION`'ı birlikte artır; yoksa tarayıcı eski dosyayı gösterebilir.
- **API önbelleği:** Frankfurter yanıtları 24 saat, CoinGecko 30 sn önbellekleniyor; bu yüzden `js/api.js` her isteği `cache: 'no-cache'` ile gönderir. Yeni istek eklerken `request()` yardımcısından geç.
- **Simgeleri yenilemek:** `node tools/make-icons.js`.
- **CoinGecko limiti:** ücretsiz planda art arda istek `429` verir (`Retry-After: 15`). Testlerde gerçek API'yi peş peşe çağırma.

## Aşamalar

- [x] 1 — Proje kurulumu
- [x] 2 — Döviz kurları (en çok işlem gören 8 para birimi, canlı)
- [x] 3 — Kripto fiyatları (piyasa değerine göre ilk 10, canlı)
- [x] 4 — Favoriler (yıldızla + localStorage)
- [x] 5 — 7 günlük grafik (Chart.js)
- [x] 6 — Arama ile yeni döviz / kripto ekleme
- [x] Ek: koyu/açık tema, her kartta grafik, fiyat alarmı, sunucu alarmı, favori sıralama, PWA
