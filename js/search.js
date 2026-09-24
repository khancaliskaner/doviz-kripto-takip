/* Arama kutusu: döviz (yerel liste) ve kripto (CoinGecko /search) paritelerini bulup
   favorilere ekletir. Eklenen parite Favoriler bölümünde canlı takip edilir. */
var Search = (function () {

  var toggleHandler = null;
  var englishNames = {};     // Frankfurter'dan gelen İngilizce adlar (yüklenene kadar boş)
  var coinCache = {};        // aranan metin -> coin listesi (aynı aramayı tekrar tekrar sormamak için)
  var token = 0;             // her yeni yazışta artar; eski aramanın yanıtı yenisini ezmesin
  var timer = null;
  var view = null;           // son çizilen sonuçlar; favori değişince yeniden çizmek için

  function el(id) {
    return document.getElementById(id);
  }

  /* "İsviçre" ile "isvicre" aynı sayılsın: küçük harfe çevir, ı→i, aksanları at. */
  function fold(s) {
    return String(s || '')
      .toLocaleLowerCase('tr-TR')
      .replace(/ı/g, 'i')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
  }

  /* --- Döviz araması (yerel) --- */

  function currencyPool() {
    var codes = {};
    Object.keys(CONFIG.currencyNamesTr).forEach(function (c) { codes[c] = true; });
    Object.keys(englishNames).forEach(function (c) { codes[c] = true; });
    delete codes[CONFIG.baseCurrency];   // TL'yi TL'ye çevirmenin anlamı yok

    return Object.keys(codes).map(function (code) {
      return {
        code: code,
        nameTr: CONFIG.currencyNamesTr[code] || '',
        nameEn: englishNames[code] || ''
      };
    });
  }

  function matchCurrencies(query) {
    var q = fold(query);

    return currencyPool()
      .map(function (c) {
        var code = fold(c.code);
        var score = 0;
        if (code === q) score = 3;
        else if (code.indexOf(q) === 0) score = 2;
        else if (code.indexOf(q) !== -1 ||
                 fold(c.nameTr).indexOf(q) !== -1 ||
                 fold(c.nameEn).indexOf(q) !== -1) score = 1;
        return { item: c, score: score };
      })
      .filter(function (r) { return r.score > 0; })
      .sort(function (a, b) { return b.score - a.score || a.item.code.localeCompare(b.item.code); })
      .map(function (r) { return r.item; });
  }

  /* --- Çizim --- */

  function buildRow(type, id, title, sub, imageUrl, badgeText) {
    var row = document.createElement('div');
    row.className = 'search-row';

    if (imageUrl) {
      var img = document.createElement('img');
      img.className = 'coin-logo';
      img.src = imageUrl;
      img.alt = '';
      img.loading = 'lazy';
      img.width = 32;
      img.height = 32;
      row.appendChild(img);
    } else {
      var badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = badgeText;
      row.appendChild(badge);
    }

    var text = document.createElement('div');
    text.className = 'card-title';
    var name = document.createElement('span');
    name.className = 'card-name';
    name.textContent = title;
    var small = document.createElement('span');
    small.className = 'card-sub';
    small.textContent = sub;
    text.appendChild(name);
    text.appendChild(small);
    row.appendChild(text);

    var on = Favorites.has(type, id);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'add-btn';
    btn.textContent = on ? '★ Favorilerde' : '☆ Ekle';
    btn.setAttribute('data-on', on ? 'true' : 'false');
    btn.setAttribute('aria-label', (on ? 'Favorilerden çıkar: ' : 'Favorilere ekle: ') + title);
    btn.addEventListener('click', function () {
      if (toggleHandler) toggleHandler(type, id);
    });
    row.appendChild(btn);

    return row;
  }

  function group(title, rows, emptyText) {
    var box = document.createElement('div');
    box.className = 'search-group';

    var h = document.createElement('h3');
    h.className = 'search-group-title';
    h.textContent = title;
    box.appendChild(h);

    if (typeof rows === 'string') {
      var p = document.createElement('p');
      p.className = emptyText === 'error' ? 'error' : 'placeholder';
      p.textContent = rows;
      box.appendChild(p);
    } else {
      rows.forEach(function (r) { box.appendChild(r); });
    }
    return box;
  }

  function render() {
    var box = el('search-results');
    if (!box) return;
    box.innerHTML = '';
    if (!view) return;

    var fxRows = view.fx.map(function (c) {
      var name = c.nameTr || c.nameEn || c.code;
      var sub = c.nameTr && c.nameEn ? c.code + ' · ' + c.nameEn : c.code;
      return buildRow('fx', c.code, name, sub, null, c.code);
    });
    box.appendChild(group('Döviz', fxRows.length ? fxRows : 'Eşleşen döviz yok.'));

    if (view.coinState === 'loading') {
      box.appendChild(group('Kripto', 'Kripto paralar aranıyor…'));
    } else if (view.coinState === 'error') {
      box.appendChild(group('Kripto', view.coinError, 'error'));
    } else {
      var coinRows = view.coins.map(function (c) {
        var sub = c.symbol + (c.rank ? ' · #' + c.rank : ' · sıralamada yok');
        return buildRow('crypto', c.id, c.name, sub, c.image);
      });
      box.appendChild(group('Kripto', coinRows.length ? coinRows : 'Eşleşen kripto para yok.'));
    }
  }

  /* --- Akış --- */

  function fetchCoins(query, my) {
    if (my !== token) return;   // bu arada yeni bir şey yazıldı

    API.searchCoins(query, CONFIG.searchMaxCoins)
      .then(function (coins) {
        coinCache[fold(query)] = coins;
        if (my !== token) return;
        view.coins = coins;
        view.coinState = 'done';
        render();
      })
      .catch(function (err) {
        if (my !== token) return;
        view.coinState = 'error';
        view.coinError = err.message;
        render();
      });
  }

  function onInput() {
    clearTimeout(timer);
    var query = el('search-input').value.trim();
    var my = ++token;

    if (query.length < CONFIG.searchMinChars) {
      view = null;
      render();
      return;
    }

    var cached = coinCache[fold(query)];
    view = {
      fx: matchCurrencies(query),
      coins: cached || [],
      coinState: cached ? 'done' : 'loading',
      coinError: ''
    };
    render();   // döviz sonuçları yerel olduğu için hemen görünür

    /* Kripto için her tuşta istek atmıyoruz: CoinGecko'nun dakikalık limiti var.
       Yazmayı bırakınca (veya Enter'a basınca) tek istek. */
    if (!cached) {
      timer = setTimeout(function () { fetchCoins(query, my); }, CONFIG.searchDebounceMs);
    }
  }

  function onKeydown(e) {
    if (e.key !== 'Enter') return;
    var query = el('search-input').value.trim();
    if (query.length < CONFIG.searchMinChars || !view || view.coinState !== 'loading') return;
    clearTimeout(timer);
    fetchCoins(query, token);
  }

  /* --- Dışarıya açılanlar --- */

  function init(onToggle) {
    toggleHandler = onToggle;
    var input = el('search-input');
    if (!input) return;
    input.addEventListener('input', onInput);
    input.addEventListener('keydown', onKeydown);
  }

  // Frankfurter'ın İngilizce adları: hem İngilizce aramayı hem de Türkçe listede olmayan kodları kapsar
  function setEnglishNames(names) {
    englishNames = names || {};
    if (view) {
      // Sonuçlar açıksa yeni adlarla yeniden eşleştir
      view.fx = matchCurrencies(el('search-input').value.trim());
      render();
    }
  }

  // Favori değişince sonuçlardaki "Ekle / Favorilerde" düğmeleri güncellensin
  function refresh() {
    if (view) render();
  }

  return { init: init, setEnglishNames: setEnglishNames, refresh: refresh };
})();
