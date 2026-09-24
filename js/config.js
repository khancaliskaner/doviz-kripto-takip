/* Uygulama genelindeki sabitler. Yeni parite eklemek için burayı düzenle. */
var CONFIG = {
  // Tüm fiyatların gösterileceği ana para birimi
  baseCurrency: 'TRY',

  api: {
    frankfurter: 'https://api.frankfurter.dev/v1',
    coingecko: 'https://api.coingecko.com/api/v3'
  },

  /* Dünyada en çok işlem gören para birimleri (BIS döviz cirosu sıralaması).
     Hepsi TL karşılığı olarak gösteriliyor. Frankfurter'ın desteklediği
     ~30 para biriminden istediğini ekleyebilirsin. */
  currencies: [
    { code: 'USD', name: 'Amerikan Doları' },
    { code: 'EUR', name: 'Euro' },
    { code: 'JPY', name: 'Japon Yeni' },
    { code: 'GBP', name: 'İngiliz Sterlini' },
    { code: 'CNY', name: 'Çin Yuanı' },
    { code: 'AUD', name: 'Avustralya Doları' },
    { code: 'CAD', name: 'Kanada Doları' },
    { code: 'CHF', name: 'İsviçre Frangı' }
  ],

  /* Arama için Türkçe para birimi adları (Frankfurter'ın desteklediği tüm birimler).
     Frankfurter yalnızca İngilizce ad veriyor; "dolar", "frank", "yen" gibi Türkçe
     aramaların çalışması için burada tutuluyor. */
  currencyNamesTr: {
    AUD: 'Avustralya Doları', BRL: 'Brezilya Reali', CAD: 'Kanada Doları',
    CHF: 'İsviçre Frangı', CNY: 'Çin Yuanı', CZK: 'Çek Kronu',
    DKK: 'Danimarka Kronu', EUR: 'Euro', GBP: 'İngiliz Sterlini',
    HKD: 'Hong Kong Doları', HUF: 'Macar Forinti', IDR: 'Endonezya Rupisi',
    ILS: 'İsrail Şekeli', INR: 'Hindistan Rupisi', ISK: 'İzlanda Kronu',
    JPY: 'Japon Yeni', KRW: 'Güney Kore Wonu', MXN: 'Meksika Pesosu',
    MYR: 'Malezya Ringgiti', NOK: 'Norveç Kronu', NZD: 'Yeni Zelanda Doları',
    PHP: 'Filipinler Pesosu', PLN: 'Polonya Zlotisi', RON: 'Romanya Leyi',
    SEK: 'İsveç Kronu', SGD: 'Singapur Doları', THB: 'Tayland Bahtı',
    USD: 'Amerikan Doları', ZAR: 'Güney Afrika Randı'
  },

  // Arama: kaç harften sonra aranacak, yazmayı bıraktıktan kaç ms sonra istek atılacak
  searchMinChars: 2,
  searchDebounceMs: 450,
  searchMaxCoins: 8,

  /* Kripto listesi sabit değil: CoinGecko'dan piyasa değerine göre ilk N coin
     canlı çekiliyor, yani "en çok işlem gören" liste kendiliğinden güncelleniyor. */
  topCoinCount: 10,

  /* Yenileme aralıkları.
     - Kripto gerçekten anlık; 60 sn CoinGecko'nun ücretsiz limiti için güvenli alt sınır.
     - Frankfurter ECB verisi kullanıyor, kurlar hafta içi günde bir kez güncelleniyor;
       sık sorgulamanın anlamı yok. */
  refresh: {
    cryptoMs: 60000,
    fxMs: 600000
  },

  storageKey: 'dkt.favorites.v1',
  /* Sekme kapalıyken de alarm için sunucu (server/server.js). Boş = uygulamayı sunan aynı adres.
     Uygulama başka yerde yayınlanıp sunucu ayrı bir HTTPS adresteyse buraya o adres yazılır
     (sunucuda ALLOW_ORIGIN ile uygulamanın adresi de verilmeli). */
  serverUrl: '',
  serverSyncKey: 'dkt.serversync.v1',

  alarmsKey: 'dkt.alarms.v1',
  themeKey: 'dkt.theme.v1'   // index.html içindeki satır içi script de aynı anahtarı okuyor
};
