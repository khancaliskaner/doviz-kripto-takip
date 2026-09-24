/* Frankfurter ve CoinGecko ile konuşan tek katman.
   Her fonksiyon Promise döner; hata durumunda anlaşılır bir Error fırlatır. */
var API = (function () {

  function request(url) {
    /* fetch yoksa (çok eski tarayıcı) senkron ReferenceError yerine
       düzgün bir Promise reddi dönüyoruz; yoksa hata hiçbir catch'e düşmüyor. */
    if (typeof fetch !== 'function') {
      return Promise.reject(new Error(
        "Bu tarayıcı fetch API'sini desteklemiyor. Sayfayı güncel Chrome, Edge veya Firefox ile aç."));
    }

    /* cache: 'no-cache' = her seferinde sunucuya "değişti mi?" diye sor (ETag ile 304 dönerse
       ucuz). Varsayılan önbellek yetmiyor: Frankfurter yanıtlarına 24 saat, CoinGecko'ya 30 sn
       max-age koyuyor; bu yüzden Yenile'ye basmak veriyi değil sadece saati güncelliyordu. */
    return fetch(url, { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) {
          if (res.status === 429) {
            throw new Error('İstek limiti aşıldı. Bir sonraki yenilemede tekrar denenecek.');
          }
          throw new Error('Sunucu hatası: ' + res.status);
        }
        return res.json();
      })
      .catch(function (err) {
        if (err instanceof TypeError) {
          throw new Error('Ağa ulaşılamadı. İnternet bağlantını kontrol et.');
        }
        throw err;
      });
  }

  function isoDaysAgo(days) {
    var d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  }

  /* --- Döviz: Frankfurter --- */

  /* Frankfurter bir istekte tek bir `base` kabul ediyor, bu yüzden base=TRY sorgulayıp
     dönen değerin tersini alıyoruz: 1 USD = 1 / (1 TRY'nin USD karşılığı). */
  function invert(rate) {
    return rate ? 1 / rate : null;
  }

  /* Güncel kurlar + bir önceki iş gününe göre değişim.
     Tarih aralığı endpoint'i son iki iş gününü tek istekte verdiği için
     "güncel" ve "değişim" bilgisini tek sorguyla alıyoruz.
     Dönen: { date, previousDate, rates: { USD: { value, change, changePct }, … } } */
  function getRates(codes, base) {
    var url = CONFIG.api.frankfurter + '/' + isoDaysAgo(10) + '..' +
              '?base=' + encodeURIComponent(base) + '&symbols=' + codes.join(',');

    return request(url).then(function (data) {
      var dates = Object.keys(data.rates).sort();
      var last = dates[dates.length - 1];
      var prev = dates[dates.length - 2];

      var out = { date: last, previousDate: prev || null, rates: {} };

      codes.forEach(function (code) {
        var value = invert(data.rates[last] && data.rates[last][code]);
        var before = prev ? invert(data.rates[prev][code]) : null;
        out.rates[code] = {
          value: value,
          change: (value !== null && before !== null) ? value - before : null,
          changePct: (value !== null && before) ? ((value - before) / before) * 100 : null
        };
      });

      return out;
    });
  }

  /* Tarih aralığı (grafik için): [{ date, value }, …]. `to` boş bırakılırsa bugüne kadar.
     Frankfurter yalnızca iş günleri için kur yayınlar, hafta sonu nokta olmaz. */
  function getRateHistory(code, base, from, to) {
    var url = CONFIG.api.frankfurter + '/' + from + '..' + to +
              '?base=' + encodeURIComponent(base) + '&symbols=' + encodeURIComponent(code);
    return request(url).then(function (data) {
      return Object.keys(data.rates).sort().map(function (date) {
        return { date: date, value: invert(data.rates[date][code]) };
      });
    });
  }

  // Frankfurter'ın desteklediği tüm para birimleri: { USD: 'United States Dollar', … }
  function getCurrencies() {
    return request(CONFIG.api.frankfurter + '/currencies');
  }

  /* --- Kripto: CoinGecko --- */

  /* İsim veya sembolle coin arama. Dönen: [{ id, symbol, name, rank, image }, …]
     rank yoksa null (çok küçük coin'lerde piyasa değeri sırası olmayabiliyor). */
  function searchCoins(query, limit) {
    var url = CONFIG.api.coingecko + '/search?query=' + encodeURIComponent(query);
    return request(url).then(function (data) {
      return (data.coins || []).slice(0, limit || 8).map(function (c) {
        return {
          id: c.id,
          symbol: (c.symbol || '').toUpperCase(),
          name: c.name,
          rank: c.market_cap_rank || null,
          image: c.thumb
        };
      });
    });
  }

  function mapMarkets(list) {
    return (list || []).map(function (c) {
      return {
        id: c.id,
        symbol: (c.symbol || '').toUpperCase(),
        name: c.name,
        image: c.image,
        rank: c.market_cap_rank,
        price: c.current_price,
        changePct: c.price_change_percentage_24h,
        volume: c.total_volume
      };
    });
  }

  /* Piyasa değerine göre ilk N coin. Liste sabit değil, API'den geliyor. */
  function getTopCoins(vsCurrency, count) {
    var vs = (vsCurrency || CONFIG.baseCurrency).toLowerCase();
    var url = CONFIG.api.coingecko + '/coins/markets?vs_currency=' + vs +
              '&order=market_cap_desc&per_page=' + count + '&page=1&sparkline=false';
    return request(url).then(mapMarkets);
  }

  /* Belirli coin'ler — ilk N listesinden düşmüş favoriler için.
     getTopCoins ile aynı biçimde dönüyor, böylece kart üretimi tek kod yolu. */
  function getCoinsByIds(ids, vsCurrency) {
    if (!ids || !ids.length) return Promise.resolve([]);
    var vs = (vsCurrency || CONFIG.baseCurrency).toLowerCase();
    var url = CONFIG.api.coingecko + '/coins/markets?vs_currency=' + vs +
              '&ids=' + ids.join(',') + '&sparkline=false';
    return request(url).then(mapMarkets);
  }

  /* Son N günün fiyat geçmişi (grafik için). 2-90 günde CoinGecko saatlik nokta veriyor.
     Dönen: [{ time (ms), date ('YYYY-MM-DD'), value }, …] */
  function getCoinHistory(id, vsCurrency, days) {
    var vs = (vsCurrency || CONFIG.baseCurrency).toLowerCase();
    var url = CONFIG.api.coingecko + '/coins/' + id + '/market_chart?vs_currency=' + vs +
              '&days=' + days;
    return request(url).then(function (data) {
      return (data.prices || []).map(function (pair) {
        return { time: pair[0], date: new Date(pair[0]).toISOString().slice(0, 10), value: pair[1] };
      });
    });
  }

  return {
    getRates: getRates,
    getRateHistory: getRateHistory,
    getCurrencies: getCurrencies,
    searchCoins: searchCoins,
    getTopCoins: getTopCoins,
    getCoinsByIds: getCoinsByIds,
    getCoinHistory: getCoinHistory
  };
})();
