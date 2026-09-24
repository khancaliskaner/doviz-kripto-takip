# Proje Durumu — Döviz & Kripto Takip

Son güncelleme: 24 Eylül 2026

## Ne yapıyoruz

Frankfurter (döviz) ve CoinGecko (kripto) API'leriyle çalışan, API anahtarı
gerektirmeyen bir takip web uygulaması. Tüm fiyatlar TL (TRY) bazlı gösteriliyor.
Yol haritası `doviz-kripto-projesi-talimat.md` dosyasındaki 6 aşamalık plan.

## Aşamalar

| # | Aşama | Durum |
|---|-------|-------|
| 1 | Proje kurulumu | ✅ bitti |
| 2 | Döviz kurları — en çok işlem gören 8 para birimi, canlı | ✅ bitti |
| 3 | Kripto fiyatları — piyasa değerine göre ilk 10, canlı | ✅ bitti (Aşama 2 ile birleştirildi) |
| 4 | Favoriler: yıldızla, localStorage, canlı güncelleme | ✅ bitti |
| 5 | 7 günlük fiyat grafiği (Chart.js, CDN) | ✅ bitti |
| 6 | Arama ile yeni döviz / kripto ekleme | ✅ bitti |

Kullanıcı Aşama 2'yi isterken "canlı takip + dünyada en çok işlem gören döviz ve
kripto ana sayfada olsun" dediği için Aşama 3'ün kapsamı da bu adımda yapıldı.
Otomatik yenileme de Aşama 4'ten öne alındı; Aşama 4'te sadece favori
işaretleme + localStorage kaldı.

### Talimat dışı, sonradan eklenenler

- Koyu / açık tema düğmesi
- Yenile düğmesinin gerçekten veriyi yenilemesi (HTTP önbelleği düzeltmesi)
- Fiyat alarmı (aşağıda)
- 📈 Grafik düğmesi her kartta (önceden yalnızca favorilerdeydi)
- Sunucu alarmı: sekme kapalıyken de bildirim (`server/`, Web Push)
- Favori sıralama: ◀ ▶ düğmeleri + sürükle-bırak
- Telefon / PWA: kurulabilir, çevrimdışı açılır, dokunmatik uyumlu
- Yayına alma hazırlığı (GitHub Pages)

## Teknik kararlar

**Build adımı yok, saf HTML/CSS/JS.** Makinede Node, npm ve Python kurulu değil.
`index.html` doğrudan çift tıklanarak açılıyor. (Sözdizimi denetimi için VS Code'un
kendi Node runtime'ı kullanılabiliyor: `ELECTRON_RUN_AS_NODE=1 Code.exe -e "..."`.)

**ES module kullanılmıyor.** `file://` üzerinden açıldığında tarayıcı `import/export`
içeren script'leri CORS nedeniyle engelliyor. Dosyalar klasik `<script>` etiketleriyle
sırayla yükleniyor ve global nesneler üzerinden haberleşiyor:
`CONFIG` → `API` → `UI` → `app.js`. Her iki API de `Access-Control-Allow-Origin: *`
gönderdiği için `file://` (origin `null`) üzerinden istekler çalışıyor.

**React tercih edilmedi.** Node kurulu olmadığı için önce onu kurmak gerekirdi; bu
ölçekte (birkaç liste + bir grafik) getirisi de sınırlı.

**Üçüncü parti kütüphane gerekirse CDN'den** `<script>` etiketiyle çekilecek
(Aşama 5'te Chart.js böyle gelecek).

**Frankfurter ters çevirme.** API tek istekte tek bir `base` kabul ediyor. `base=TRY`
ile sorgulayıp dönen değerin tersini alıyoruz; böylece "1 USD = ? TL" elde ediliyor.

**Günlük değişim tek istekte.** Güncel kur ve bir önceki iş gününe göre yüzde değişim
için iki ayrı istek atmak yerine son 10 günün aralık endpoint'i çekiliyor; son iki
iş günü oradan alınıyor.

**İki farklı yenileme aralığı.** Kripto 60 sn (CoinGecko ücretsiz limiti için güvenli
alt sınır), döviz 10 dk. Frankfurter ECB referans kurlarını kullanıyor ve bunlar hafta
içi günde bir kez güncelleniyor — daha sık sormanın karşılığı yok.

**Sekme arka plandayken yenileme duruyor.** `visibilitychange` ile timer'lar
durduruluyor, sekmeye dönüldüğünde veri bayatsa hemen tazeleniyor. Amaç CoinGecko'nun
dakikalık limitini boşa harcamamak. İstisna: aktif alarm varsa durmuyor (bkz. Fiyat alarmları).

**Favoriler tek durumdan çiziliyor.** Ekrandaki her şey `state` nesnesinden üretiliyor;
yıldıza basıldığında ağa hiç gidilmeden sadece yeniden çiziliyor. Favori bir coin ilk 10
listesinden düşerse, yenileme sırasında sadece o coin için tek ek istek atılıyor
(`getCoinsByIds`); favori yoksa hiç ek istek yok.

**localStorage güvenli sarmalanmış.** Gizli sekmede veya kısıtlı ayarlarda `localStorage`
hata fırlatabiliyor. `js/storage.js` bunu yakalıyor: uygulama çalışmaya devam ediyor,
sadece favori bölümünde "tarayıcı kaydetmeye izin vermiyor" notu çıkıyor.

**Hatalar ekranda görünür.** `file://` üzerinden konsol açılmadan hata görünmediği için
sayfanın üstünde gizli bir hata şeridi var; `window.onerror` ve `unhandledrejection`
oraya yazıyor. Script ve CSS etiketlerinde `?v=N` önbellek kırıcı var — sürüm
değiştikçe artırılıyor (şu an v10; sw.js içindeki VERSION da aynı olmalı, testte karşılaştırılıyor).

**Yenile düğmesi ve HTTP önbelleği.** Frankfurter yanıtları `max-age=86400` (24 saat), CoinGecko
`max-age=30` ile geliyor; varsayılan `fetch` bunları önbellekten veriyordu, bu yüzden Yenile
sadece saati güncelliyor, döviz verisi ise 10 dakikalık otomatik yenilemede de değişmiyordu.
Tüm istekler artık `cache: "no-cache"` ile gidiyor: her seferinde sunucuya doğrulatılıyor,
değişmediyse 304 dönüyor. Kurlar günde bir kez değiştiği için döviz başlığında ayrıca
"son kontrol" saati var; yoksa Yenile'ye basınca döviz bölümünde hiçbir şey değişmiş görünmezdi.

**Arama.** Döviz araması yerelde: Frankfurter'ın 29 para birimi, `CONFIG.currencyNamesTr` ile
Türkçe adlarıyla ("dolar", "frank", "yen"), aksansız ("isvicre") ve İngilizce adla da
eşleşiyor; TL sonuçlarda çıkmıyor. Kripto araması CoinGecko `/search` ile, yazmayı bırakınca
(450 ms) tek istekle; her tuşta istek atılmıyor. Yeni yazışta eski aramanın yanıtı yok sayılıyor,
aynı arama önbellekten geliyor. Bulunan parite "☆ Ekle" ile favorilere eklenir; ana listede
olmayan parite için fiyat hemen tek istekle çekilir, favoriden çıkarılınca tamamen kalkar.

**Ana liste dışındaki kripto favorilerin fiyatı.** Aşama 4'te bir hata vardı: "listede yok"
ölçütü `coinsById` idi, bir kez çekilen coin orada sonsuza dek kaldığı için fiyatı bir daha
yenilenmiyordu. Ölçüt artık `topOrder`; her yenilemede bu favoriler yeniden çekiliyor.

**Fiyat alarmları.** Her kartta 📈 Grafik yanında 🔔 Alarm düğmesi var; pencerede yalnızca hedef
fiyat yazılıyor (`4.200.000`, `48,5`, `₺ 4.200.000` gibi Türkçe/İngilizce yazımlar ayrıştırılıyor).
Yön sorulmuyor: hedef güncel fiyatın üstündeyse "yükselince", altındaysa "düşünce" seçiliyor;
böylece alarm kurulur kurulmaz tetiklenemez. Hedef güncel fiyatla aynıysa veya aynı alarm zaten
varsa reddediliyor. Alarm **bir kez** tetikleniyor, sonra listede "Tetiklendi" olarak kalıyor
(Sil / Tetiklenenleri temizle ile kalkıyor). Mantık `js/alarms.js`te (saklama, `evaluate`,
`parsePrice`), ekran `js/alarmui.js`te. Tetiklenince sayfanın üstünde kapatılabilir uyarı şeridi
çıkıyor, izin verildiyse tarayıcı bildirimi gönderiliyor, sekme arka plandaysa başlığa 🔔 rozeti
konuyor. Bildirim izni ilk alarm kurulurken (kullanıcı hareketi içinde) isteniyor.
Kontrol her veri yenilemesinden sonra (`checkAlarms`) yapılıyor.

**Alarm sınırları (bilerek kabul edildi).** Sunucu yok; alarmlar yalnızca sayfa bir sekmede
açıkken kontrol edilir, sekme kapalıyken hiçbir şey çalışmaz. Sayfa yeniden açılınca ilk veriyle
koşul zaten sağlanıyorsa alarm o an tetiklenir (gerçek tetiklenme zamanı bilinmez). Sekme arka
plandayken aktif alarm varsa zamanlayıcılar çalışmaya devam eder (yoksa durur); tarayıcılar
arka plandaki zamanlayıcıları yavaşlatabildiği için alarm birkaç saniye-dakika gecikebilir.
Alarm kurulan parite favoriden çıkarılsa bile fiyatı çekilmeye devam eder (`trackedIds`).

**CoinGecko ücretsiz limiti düşük.** Uygulamayı geliştirirken art arda istek atınca
`429 Too Many Requests` (`Retry-After: 15`) alındı; yaklaşık dakikada 5-15 istek. Uygulama 429'u
"İstek limiti aşıldı" mesajına çeviriyor ve bir sonraki döngüde tekrar deniyor, alarm kontrolü
o turda atlanıyor. Çok hızlı arama / Yenile / grafik açma limiti tetikleyebilir.

**Sunucu alarmı.** `server/server.js` (dış paket yok, Node 18+) uygulamayı sunar, istemcinin alarm
listesini `POST /api/sync` ile saklar ve her dakika fiyatları sorgulayıp alarmları tetikler
(kripto: CoinGecko `simple/price`, döviz: Frankfurter `latest`, tek istekte toplu). Tetiklenince tarayıcının
push servisine **yüksüz** (boş) VAPID imzalı bir "dürtme" gider; `sw.js` uyanıp metni sunucudan
`POST /api/alerts/take` ile alır. Yük göndermediğimiz için RFC 8291 şifrelemesi gerekmiyor; tek kriptografi
VAPID (ES256) imzası, Node'un `crypto`'suyla. Birleştirme kuralı: alarmın **varlığına** istemci, **tetiklenmiş
olmasına** sunucu yetkili; istemci listeyi toptan değiştirmez, yalnızca "tetiklendi" bilgisini uygular
(`Alarms.applyTriggered`), yoksa istek yoldayken eklenen/silinen alarm kaybolurdu. Sayfa açıkken yerel tetikleme
yine çalışır ve sunucuya bildirilir, böylece sunucu ikinci kez push atmaz. Bildirimler alarm kimliğini `tag`
olarak kullanır: sayfa ve service worker aynı alarm için bildirim gösterse tek bildirime iner.
`baslat-sunucu.bat` Node yoksa VS Code'un Node'unu kullanır.

**Sunucu güvenliği.** İstemcinin verdiği push adresine sunucu istek atar (SSRF riski): yalnızca https + bilinen
push servisleri (FCM, Mozilla, Apple, WNS), kullanıcı bilgisi/port yok. Gelen her alarm doğrulanır (kimlik,
tür, yön, sayı). Gövde 256 KB'ı, cihaz sayısı 20'yi, cihaz başına alarm 100'ü aşamaz; büyük gövdede bağlantıyı
kesmek yerine 413 yanıtlanır. `Origin` başlığı aynı sunucudan ya da `ALLOW_ORIGIN`'den değilse 403. Statik
sunumda yalnızca izinli üst klasörler (`server/` ve `.md` dosyaları asla). `server/data/` (özel anahtar) `.gitignore`'da.

**Sunucu sınırları (bilerek).** Kimlik doğrulama yok (kişisel kullanım; `HOST=0.0.0.0` yerel ağa açar). Bilgisayar
kapalıyken çalışmaz. Telefonda push HTTPS ister. Gerçek push teslimi (FCM/Mozilla/Apple) bu ortamda **denenemedi**:
imzanın doğruluğu açık anahtarla doğrulandı ve sunucu/service worker mantığı sahte push servisiyle sınandı,
ama gerçek tarayıcıda bildirimin gelip gelmediğini kullanıcı görmeli.

**Favori sıralama.** `Favorites.moveTo(tip, id, hedefSırası)` (hedefin taşımadan ÖNCEKİ sırası). ◀ ▶ komşuyu
**ekranda görünenler** arasından seçer; fiyatı henüz gelmemiş favori atlanır, yoksa düğme "çalışmıyor" gibi
görünürdü. Sürükle-bırak masaüstü içindir (HTML5 sürükleme telefonda güvenilmez), dokunmatikte ◀ ▶ asıl yol.
Sürükleme sürerken favori kartları yeniden çizilmez (60 sn'lik yenileme kaynak kartı DOM'dan koparırdı),
`dragend`'de ertelenen çizim yapılır. ◀ ▶ sonrası odak aynı düğmeye geri verilir.

**PWA.** `manifest.webmanifest` + `sw.js` + `icons/` (192, 512, maskable, iOS 180; `tools/make-icons.js` çizer).
Service worker **önce ağ, olmazsa önbellek** (kendi dosyalarımız) kullanır; "önce önbellek" geliştirirken hep eski
dosyayı gösterirdi. Fiyat API'lerine ve `/api/`'ye dokunmaz (bayat fiyat gösterilmesin). Chart.js CDN'i önce
önbellek. Kurulum tek dosya 404 olsa da çökmez (dosyalar tek tek eklenir). `viewport-fit=cover` + `env(safe-area-*)`,
dokunmatikte 40px hedefler, 600px altında pencereler alttan açılan sayfa, iOS'un odakta yakınlaştırmasını
önlemek için 16px giriş yazısı. `file://`'da service worker çalışmaz, `pwa.js` sessizce atlar.

**Yayınlanan sitede sunucu yok.** GitHub Pages statiktir; sayfa `/api/health`'i bulamazsa kendini "yalnızca sayfa
açıkken" moduna alır ve mesajı yayına özel yazar ("Bu yayında alarm sunucusu yok").

**Koyu / açık tema.** Başlıktaki ☀ / ☾ düğmesiyle değişiyor. Seçim yapılmadıysa sistem temasını
izliyor (`prefers-color-scheme`), seçim yapılınca `data-theme` özniteliği sistemi geçersiz
kılıyor ve localStorage'a kaydediliyor. Sayfa boyanmadan önce `<head>` içindeki küçük bir
satır içi script kayıtlı temayı uyguluyor; yoksa açık tema seçen kullanıcı her açılışta bir an
koyu tema görür. CSS'te iki açık tema bloğu var (öznitelikle ve medya sorgusuyla) ve değerleri
birebir aynı olmak zorunda; yeni bir renk eklenirse ikisine de eklenmeli. Grafik renkleri
pencere açılırken CSS değişkenlerinden okunduğu için temayla uyumlu çiziliyor.

**Favoriye alınan pariteler ana listeden çıkar.** Bir parite favoriye eklenince yalnızca
Favoriler bölümünde görünür, favoriden çıkarılınca ana listedeki yerine döner. Tüm
liste favoriye alınırsa ana listede bilgi mesajı çıkar. Grafik ve alarm düğmeleri ise her kartta var, ana listede de favorilerde de aynı görünüm.

**Grafik penceresi.** Chart.js 4.4.7 CDN'den `<script>` ile yükleniyor. Kripto için
CoinGecko 7 günde saatlik nokta veriyor (~169 nokta), döviz için Frankfurter günlük
kur veriyor ve yalnızca iş günleri yayınlanıyor (~6 nokta, hafta sonu boşluğu var).
Hızlı art arda tıklamada eski isteğin yanıtı yenisinin üstüne çizilmesin diye her açılışta
bir `requestId` tutuluyor. Aynı parite kısa süre içinde tekrar açılırsa önbellekten çiziliyor
(kripto 60 sn, döviz 10 dk). Yıldız butonu `stopPropagation` yaptığı için grafik açmıyor.
Dar aralıklı verilerde (ör. USD 48,81-48,82) eksen etiketleri aynı çıkmasın diye ondalık
basamak veri aralığına göre artırılıyor. Esc, arka plana tıklama ve kapat düğmesiyle
kapanıyor; Chart.js yüklenemezse pencerede anlaşılır hata mesajı çıkıyor.

**Kripto listesi sabit değil.** `/coins/markets` ile piyasa değerine göre ilk 10 coin
API'den çekiliyor, yani liste kendiliğinden güncel kalıyor. Döviz listesi ise
`CONFIG.currencies` içinde sabit (BIS işlem hacmi sıralamasına göre 8 para birimi).

## Dosya yapısı

```
sw.js, manifest.webmanifest, baslat-sunucu.bat, icons/, tools/make-icons.js, server/{server,webpush}.js  (bkz. README)
index.html        başlık + canlı göstergesi, döviz / kripto / favoriler bölümleri
css/style.css     tema değişkenleri (koyu/açık otomatik), kart ızgarası, iskelet animasyonu
js/config.js      para birimleri, coin sayısı, API adresleri, yenileme aralıkları
js/storage.js     favorilerin localStorage'da saklanması ("fx:USD", "crypto:bitcoin") ve sıralama
js/alarms.js      fiyat alarmları: saklama, tetikleme koşulu, fiyat girdisini ayrıştırma
js/theme.js       koyu / açık tema düğmesi, seçimi localStorage'da saklar
js/api.js         Frankfurter + CoinGecko istekleri ve veri dönüşümleri
js/ui.js          biçimlendirme (TL, yüzde, tarih) + kart üretimi
js/chartview.js   favori kartına tıklayınca açılan 7 günlük grafik penceresi (Chart.js)
js/alarmui.js     alarm penceresi, Fiyat Alarmları paneli, uyarı şeridi, bildirim
js/pwa.js         service worker kaydı, "yükle" düğmesi, iOS ipucu, çevrimdışı durumu
js/serversync.js  alarmları sunucuyla eşitler, push aboneliğini yönetir
js/search.js      arama kutusu: döviz (yerel liste) + kripto (CoinGecko /search)
js/app.js         giriş noktası, durum yönetimi, çizim, canlı yenileme döngüsü
```

### js/api.js fonksiyonları

| Fonksiyon | Ne döner | Durum |
|---|---|---|
| `API.getRates(codes, base)` | `{ date, previousDate, rates: { USD: { value, change, changePct }, … } }` | kullanımda |
| `API.getTopCoins(vs, count)` | `[{ id, symbol, name, image, rank, price, changePct, volume }, …]` | kullanımda |
| `API.getCoinsByIds(ids, vs)` | getTopCoins ile aynı biçim | kullanımda |
| `API.getRateHistory(code, base, from, to)` | `[{ date, value }, …]` (to boş = bugüne kadar) | kullanımda (grafik) |
| `API.getCurrencies()` | `{ USD: "United States Dollar", … }` | kullanımda (arama) |
| `API.searchCoins(query, limit)` | `[{ id, symbol, name, rank, image }, …]` | kullanımda (arama) |
| `API.getCoinHistory(id, vs, days)` | `[{ time, date, value }, …]` (7 günde saatlik) | kullanımda (grafik) |

## Çalıştırma ve test

Geliştirme sırasında VS Code Live Server kullanılıyor: `http://127.0.0.1:5500/index.html`.
`index.html` doğrudan çift tıklanarak da açılabiliyor. Beklenen davranış:

- Kartlar önce iskelet (shimmer) halinde görünür, sonra veriyle dolar.
- Döviz bölümünde 8 kart: USD, EUR, JPY, GBP, CNY, AUD, CAD, CHF — TL karşılığı ve
  bir önceki güne göre yüzde değişim (yeşil/kırmızı).
- Kripto bölümünde 10 kart: logo, sembol, piyasa değeri sırası, TL fiyatı,
  24 saatlik değişim ve işlem hacmi.
- Sağ üstte yeşil yanıp sönen nokta ve "Canlı · N sn" geri sayımı; sıfıra inince
  kripto fiyatları kendiliğinden tazelenir.
- Başka sekmeye geçince gösterge "Duraklatıldı"ya döner, geri dönünce tazelenir.
- Kartlardaki ☆ simgesine basınca parite en üstteki Favoriler bölümüne eklenir, simge
  dolu sarı yıldıza (★) döner ve seçim localStorage'a yazılır. Sayfa yenilenince favoriler
  yerinde kalır. Dolu yıldıza basmak favoriden çıkarır.
- Favoriye alınan kart ana listeden çıkar; favoriden çıkarınca ana listeye döner.
- Her kartta (ana liste ve favoriler) 📈 Grafik ve 🔔 Alarm düğmesi var; karta tıklamak da grafik açar.
- 🔔 Alarm: hedef fiyat yaz, önizlemede yön ve uzaklık görünür, "Alarm kur" ile kurulur. Kart
  düğmesi "Alarm (n)" olur, Fiyat Alarmları panelinde listelenir. Hedefe ulaşınca üstte uyarı çıkar.
- Sağ üstteki ☀ / ☾ düğmesi temayı değiştirir; sayfa yenilenince seçim korunur.
- Yenile'ye basınca hem kripto fiyatları hem döviz kurları sunucudan yeniden sorulur; döviz
  başlığındaki "son kontrol" saati güncellenir.
- "Ara ve Ekle" kutusuna en az 2 harf yazınca döviz sonuçları hemen, kripto sonuçları yazmayı
  bırakınca gelir. "☆ Ekle" ile favorilere eklenir; parite Favoriler bölümünde canlı takip edilir.
- Favori kartına (veya üstündeki "Grafik" düğmesine) tıklayınca 7 günlük grafik penceresi
  açılır: son fiyat, 7 günlük değişim, en yüksek, en düşük ve çizgi grafik. Esc veya dışarıya
  tıklayınca kapanır.

Kod tarayıcı olmadan da doğrulanabiliyor: VS Code'un Node runtime'ı ile sahte bir DOM
kurulup tüm scriptler gerçek API verisiyle koşturuluyor (yıldıza tıklama dahil).
Son koşularda (favoriler, grafik, arama, Yenile düzeltmesi, alarmlar) ana listeden çıkarma, kabarcıklanma, gerçek API verisiyle
grafik verisi, yarış durumu, Esc/arka plan ile kapanma ve Chart.js yüklenemediğinde hata
mesajı geçti. Not: bu testte Chart.js sahte bir sınıfla değiştirildi; grafiğe verilen veri ve
ayarlar doğrulandı ama çizginin ekranda görünüşü tarayıcıda gözle kontrol edilmeli.

**Testler (scratchpad, depoda değil; oturum değişince yeniden yazmak gerekebilir):** `server-test` (sunucu, gerçek HTTP + gerçek Frankfurter/CoinGecko yanıt biçimi), `sync-test` (gerçek sunucu + gerçek uygulama + gerçek `sw.js`,
sahte push servisi ve sahte tarayıcı Push API'si), `reorder-test`, `pwa-test` (manifest, PNG geçerliliği, `sw.js`
önbellek davranışı, kurulum düğmesi), `dom-test5` (alarm/grafik). Hepsi geçti.

Alarm testi (`dom-test5.js`) bir noktada gerçek API yerine gerçek yanıtın anlık görüntüsünü
kullanıyor: CoinGecko limiti art arda istekte 429 verdiği için başta bir kez gerçek `/coins/markets`
yanıtı alınıyor, uygulamaya fiyat çarpanıyla (×1,3 ve ×0,5) verilerek "fiyat hedefe ulaştı"
durumu üretiliyor. Bildirimler ve zamanlayıcılar da sahte; gerçek bildirim penceresi ve arka plan
yavaşlatması tarayıcıda denenmeli.
