# Döviz + Kripto Takip Uygulaması - Talimat Dosyası

Bu dosya iki bölümden oluşuyor: (1) kullanılacak API'ler hakkında bilgi, (2) VS Code'daki Claude'a projeyi yaptırmak için vereceğin istekler.

---

## BÖLÜM 1: Kullanılacak API'ler

Bu proje için **key gerektirmeyen, tamamen ücretsiz** iki API kullanacağız — kayıt derdi yok, direkt kodlamaya geçebilirsin.

### Döviz kurları: Frankfurter.app
- Dokümantasyon: https://frankfurter.dev
- Örnek istek (güncel kurlar, TL bazlı):
  ```
  https://api.frankfurter.dev/v1/latest?base=USD&symbols=TRY,EUR,GBP
  ```
- Örnek yanıt:
  ```json
  {
    "base": "USD",
    "date": "2026-09-23",
    "rates": { "TRY": 34.12, "EUR": 0.92, "GBP": 0.79 }
  }
  ```
- Geçmiş veri için: `https://api.frankfurter.dev/v1/2026-01-01..2026-09-23?base=USD&symbols=TRY`

### Kripto: CoinGecko API
- Dokümantasyon: https://www.coingecko.com/en/api/documentation
- Örnek istek (anlık fiyat, TL bazlı):
  ```
  https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=try
  ```
- Örnek yanıt:
  ```json
  { "bitcoin": { "try": 3120000 }, "ethereum": { "try": 118000 } }
  ```
- Geçmiş fiyat grafiği için: `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=try&days=7`

**Not:** CoinGecko'nun ücretsiz planında dakikada istek limiti var (yaklaşık 10-30 istek/dk), bu yüzden sürekli otomatik yenileme yaparken çok sık istek atmamaya dikkat et.

---

## BÖLÜM 2: VS Code'daki Claude'a Vereceğin İstekler

Aşağıdaki istekleri sırasıyla, her birini ayrı ayrı vererek ilerle. Her aşamayı test ettikten sonra bir sonrakine geç.

### İstek 1 - Proje Kurulumu
```
Bir döviz + kripto takip web uygulaması yapacağız. Frankfurter.app (döviz)
ve CoinGecko (kripto) API'lerini kullanacağım, ikisi de key gerektirmiyor.
Proje için temel bir HTML/CSS/JavaScript yapısı kur (veya istersen React öner).
```

### İstek 2 - Döviz Kurları (Aşama 1)
```
Frankfurter.app API'sini kullanarak birkaç yaygın döviz paritesini
(USD/TRY, EUR/TRY, GBP/TRY) ekranda listeleyen bir bölüm oluştur.
Kurlar sayfa açıldığında otomatik çekilsin ve güncel tarih de gösterilsin.
```

### İstek 3 - Kripto Fiyatları (Aşama 2)
```
CoinGecko API'sini kullanarak birkaç popüler kripto paranın (bitcoin,
ethereum, dogecoin gibi) güncel TL fiyatını gösteren bir bölüm ekle.
Döviz bölümünün altına veya yanına, ayrı bir kart/liste olarak yerleştir.
```

### İstek 4 - Favori Pariteler (Aşama 3)
```
Kullanıcının hem döviz hem kripto paritelerinden istediklerini favorilere
ekleyip localStorage'da saklamasını istiyorum. Favoriler ayrı bir bölümde
listelensin ve düzenli aralıklarla (örneğin 60 saniyede bir) otomatik
güncellensin. Favorilerden çıkarma özelliği de ekle.
```

### İstek 5 - Basit Grafik (Aşama 4)
```
Favori listesindeki bir paritenin üzerine tıklandığında, son 7 günlük
fiyat/kur geçmişini basit bir çizgi grafikle gösteren bir detay ekranı
veya popup oluştur. Grafik için Chart.js kullanabilirsin. Döviz için
Frankfurter'ın tarih aralığı endpoint'ini, kripto için CoinGecko'nun
market_chart endpoint'ini kullan.
```

### İstek 6 - Arama/Filtreleme (isteğe bağlı, ekstra)
```
Kullanıcının favori olmayan başka döviz veya kripto paritelerini arayıp
listeye ekleyebileceği bir arama kutusu ekle.
```

---

## Genel Not

Her istekten sonra Claude'un yazdığı kodu çalıştırıp test et, hata alırsan
hatayı olduğu gibi Claude'a yapıştırıp "bu hatayı düzelt" de. Bir aşama
tam çalışmadan bir sonrakine geçme — bu şekilde hem daha az karmaşaya
düşersin hem de her adımı anlayarak ilerlersin.
