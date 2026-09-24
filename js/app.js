/* Uygulamanın giriş noktası: veri çekme, çizim, canlı yenileme döngüsü. */
(function () {

  var timers = { crypto: null, fx: null, tick: null };
  var lastCryptoAt = 0;
  var nextCryptoAt = 0;
  var loading = false;
  var favRenderPending = false;   // sürükleme sürerken ertelenen favori çizimi

  /* Ekrana çizilen her şey bu tek durumdan üretiliyor. Favori değiştiğinde
     yeniden istek atmadan, sadece bu durumdan yeniden çiziyoruz. */
  var state = {
    fx: null,          // API.getRates çıktısı
    coinsById: {},     // id -> coin
    topOrder: [],      // ilk N coin'in sırası
    fxNames: {}        // Frankfurter'ın İngilizce ad listesi (Türkçe ad yoksa yedek)
  };

  /* --- Hata görünürlüğü ---
     Yakalanmayan her hata sayfanın üstündeki şeride yazılıyor; yoksa
     konsolu açmadan sayfanın neden durduğu anlaşılmıyor. */

  function showFatal(message) {
    var box = document.getElementById('fatal');
    if (!box) return;
    box.hidden = false;
    box.textContent = 'Hata: ' + message;
    // UI yüklenememişse hata göstericinin kendisi patlamasın
    if (typeof UI !== 'undefined' && UI.setLive) UI.setLive('error', 'Durdu');
  }

  window.addEventListener('error', function (e) {
    var where = e.filename ? ' (' + String(e.filename).split('/').pop() + ':' + e.lineno + ')' : '';
    showFatal((e.message || 'bilinmeyen hata') + where);
  });

  window.addEventListener('unhandledrejection', function (e) {
    var reason = e.reason && e.reason.message ? e.reason.message : String(e.reason);
    showFatal(reason);
  });

  /* --- Çizim --- */

  // Kart için { code, name }: Türkçe ad, yoksa Frankfurter'ın İngilizce adı, o da yoksa kodun kendisi
  function currencyMeta(code) {
    return {
      code: code,
      name: CONFIG.currencyNamesTr[code] || state.fxNames[code] || code
    };
  }

  /* Favoriye alınan pariteler ana listeden çıkıp yalnızca Favoriler'de görünür;
     favoriden çıkarılınca ana listedeki yerine döner. */
  function renderFx() {
    if (!state.fx) return;

    var visible = CONFIG.currencies.filter(function (cur) {
      return !Favorites.has('fx', cur.code);
    });

    if (!visible.length) {
      UI.showMessage('fx-list', 'Tüm para birimleri favorilerde.');
      return;
    }
    UI.renderCards('fx-list', visible.map(function (cur) {
      return UI.currencyCard(cur, state.fx.rates[cur.code] || {});
    }));
  }

  function renderCrypto() {
    if (!state.topOrder.length) return;

    var visible = state.topOrder.filter(function (id) {
      return !Favorites.has('crypto', id);
    });

    if (!visible.length) {
      UI.showMessage('crypto-list', 'İlk ' + CONFIG.topCoinCount + ' kripto paranın hepsi favorilerde.');
      return;
    }
    UI.renderCards('crypto-list', visible.map(function (id) {
      return UI.coinCard(state.coinsById[id]);
    }));
  }

  // Kartı çizilebilecek durumdaki favoriler (fiyat verisi gelmiş olanlar), kayıtlı sırayla
  function shownFavorites() {
    return Favorites.list().filter(function (fav) {
      // Arama ile yeni eklenen bir favorinin fiyatı henüz gelmemiş olabilir
      return fav.type === 'fx'
        ? !!(state.fx && state.fx.rates[fav.id])
        : !!state.coinsById[fav.id];
    });
  }

  function renderFavorites() {
    // Kart sürüklenirken yeniden çizersek kaynak kart DOM'dan kopar; sürükleme bitince çizilir
    if (UI.isDragging()) { favRenderPending = true; return; }
    favRenderPending = false;

    var favs = Favorites.list();

    if (!favs.length) {
      UI.showMessage('fav-list',
        'Henüz favori yok. Aşağıdaki kartlarda ☆ simgesine tıklayarak ekleyebilirsin.');
      UI.setMeta('fav-meta', '');
      return;
    }

    var shown = shownFavorites();
    var pending = favs.length - shown.length;

    var cards = shown.map(function (fav, i) {
      var opts = { fav: { index: i, count: shown.length } };   // ◀ ▶ düğmelerinin uç durumları için
      return fav.type === 'fx'
        ? UI.currencyCard(currencyMeta(fav.id), state.fx.rates[fav.id], opts)
        : UI.coinCard(state.coinsById[fav.id], opts);
    });

    if (!cards.length) {
      UI.showMessage('fav-list', 'Favori fiyatları yükleniyor…');
    } else {
      UI.renderCards('fav-list', cards);
    }

    var meta = favs.length + ' parite';
    if (pending) meta += ' · ' + pending + " tanesi yükleniyor";
    if (shown.length > 1) meta += " · ◀ ▶ veya sürükle-bırak ile sırala";
    meta += " · kripto 60 sn, döviz 10 dk arayla güncelleniyor";
    if (!Favorites.isWritable()) {
      meta += " · tarayıcı kaydetmeye izin vermiyor, favoriler sayfa yenilenince kaybolur";
    }
    UI.setMeta('fav-meta', meta);
  }

  /* Favori sırasını değiştir. action: { dir: -1|1 } (◀ ▶ düğmeleri: ekranda görünen komşuyla yer
     değiştir) ya da { beforeType, beforeId } (sürükle-bırak: o kartın yerine geç).
     "Komşu" ekranda görünenler arasından seçilir; fiyatı henüz gelmemiş görünmez favori atlanır,
     yoksa düğmeye basınca hiçbir şey olmamış gibi görünürdü. */
  function onReorderFavorite(type, id, action) {
    var target = null;

    if (action.dir) {
      var shown = shownFavorites();
      var at = -1;
      shown.forEach(function (f, n) { if (f.type === type && f.id === id) at = n; });
      if (at === -1) return;
      target = shown[at + action.dir];
    } else {
      target = { type: action.beforeType, id: action.beforeId };
    }
    if (!target) return;

    var to = Favorites.indexOf(target.type, target.id);
    if (to === -1 || !Favorites.moveTo(type, id, to)) return;

    renderFavorites();
    if (action.dir) UI.focusFavorite(type, id, action.dir);
  }

  function renderAll() {
    renderFx();
    renderCrypto();
    renderFavorites();
    AlarmUI.renderPanel();
  }

  /* --- Alarmlar --- */

  // Alarm kontrolü ve pencere/panel için güncel fiyat: doviz kuru ya da coin fiyati
  function priceOf(type, id) {
    if (type === 'fx') {
      var r = state.fx && state.fx.rates[id];
      return r ? r.value : null;
    }
    var c = state.coinsById[id];
    return c ? c.price : null;
  }

  /* Ana listelerde olmasa bile fiyatı çekilmesi gereken pariteler: favoriler + aktif alarmlar.
     Kullanıcı alarm kurduğu bir pariteyi favoriden çıkarsa alarm sessizce kör kalmasın. */
  function trackedIds(type) {
    var ids = Favorites.listOf(type).slice();
    Alarms.activeIds(type).forEach(function (id) {
      if (ids.indexOf(id) === -1) ids.push(id);
    });
    return ids;
  }

  // Her veri yenilemesinden sonra: koşulu sağlayan alarmları tetikle, ekranı güncelle
  function checkAlarms() {
    var fired = Alarms.evaluate(priceOf);
    if (fired.length) {
      AlarmUI.notify(fired);
      renderAll();   // kartlardaki 'Alarm (n)' sayaçları değişti
    }
    AlarmUI.refresh();

    /* Sunucu takibi açıksa: yerel durumu sunucuya bildir (sunucu aynı alarm için ikinci kez push
       atmasın) ve sunucunun sen yokken yakaladıklarını al. Kapalıysa hiçbir şey yapmaz. */
    ServerSync.sync();

    // Arka planda yalnızca alarm için çalışıyorduk; son alarm da bittiyse istek atmayı bırak
    if (document.hidden && !Alarms.active().length) {
      stopTimers();
      UI.setLive('paused', 'Duraklatıldı');
    }
  }

  function onAlarmsChanged() {
    renderAll();
    AlarmUI.refresh();
    ServerSync.sync();
  }

  // Sunucu, sayfa kapalıyken/arka plandayken bir alarmı tetiklemiş: sayfa içi uyarıyı göster
  function onServerTriggered(alarms) {
    AlarmUI.notify(alarms, { server: true });
    renderAll();
    AlarmUI.refresh();
  }

  /* --- Veri çekme --- */

  function indexCoins(coins) {
    coins.forEach(function (c) { state.coinsById[c.id] = c; });
  }

  function loadFx() {
    // Ana listedeki birimler + favoriler + alarm kurulanlar, tek istekte
    var codes = CONFIG.currencies.map(function (c) { return c.code; });
    trackedIds('fx').forEach(function (code) {
      if (codes.indexOf(code) === -1) codes.push(code);
    });

    return API.getRates(codes, CONFIG.baseCurrency)
      .then(function (data) {
        state.fx = data;
        /* Kurlar günde bir kez değiştiği için "son kontrol" saati de gösteriliyor;
           yoksa Yenile'ye basınca döviz bölümünde hiçbir şey değişmiş gibi görünmüyor. */
        UI.setMeta('fx-meta', 'Kur tarihi: ' + UI.formatDate(data.date) +
          (data.previousDate ? ' · değişim ' + UI.formatDate(data.previousDate) + ' kapanışına göre' : '') +
          ' · son kontrol ' + UI.formatTime(new Date()));
        renderFx();
        renderFavorites();
        checkAlarms();
      })
      .catch(function (err) {
        if (!state.fx) UI.showError('fx-list', err.message);
        UI.setMeta('fx-meta', 'Kurlar alınamadı');
      });
  }

  function loadCrypto() {
    return API.getTopCoins(CONFIG.baseCurrency, CONFIG.topCoinCount)
      .then(function (coins) {
        state.topOrder = coins.map(function (c) { return c.id; });
        indexCoins(coins);

        /* İlk N listesinden düşmüş favori coin'ler için tek ek istek.
           Favori yoksa veya hepsi listedeyse hiç istek atılmıyor. */
        /* "Listede yok" ölçütü coinsById değil topOrder: coinsById'de bir kez bulunan coin
           orada sonsuza dek kalır, ölçüt o olursa dışarıdaki favorinin fiyatı bir daha
           hiç yenilenmezdi. */
        var missing = trackedIds('crypto').filter(function (id) {
          return state.topOrder.indexOf(id) === -1;
        });
        return API.getCoinsByIds(missing, CONFIG.baseCurrency).then(indexCoins);
      })
      .then(function () {
        lastCryptoAt = Date.now();
        UI.setMeta('crypto-meta', 'Piyasa değerine göre ilk ' + CONFIG.topCoinCount +
          ' · son fiyat ' + UI.formatTime(new Date()));
        renderCrypto();
        renderFavorites();
        checkAlarms();
      })
      .catch(function (err) {
        if (!state.topOrder.length) UI.showError('crypto-list', err.message);
        UI.setMeta('crypto-meta', 'Fiyatlar alınamadı');
      });
  }

  /* --- Favori değişimi --- */

  function onToggleFavorite(type, id) {
    var added = Favorites.toggle(type, id);
    // Önce ağa gitmeden, elimizdeki durumdan yeniden çiziyoruz
    renderAll();
    Search.refresh();
    if (added) fetchIfMissing(type, id);
  }

  /* Arama ile eklenen bir parite ana listelerde yoksa fiyatı elimizde değildir; bir sonraki
     yenileme döngüsünü (60 sn / 10 dk) beklemeden hemen çekiyoruz. */
  function fetchIfMissing(type, id) {
    var job = null;

    if (type === 'fx' && (!state.fx || !state.fx.rates[id])) {
      job = loadFx();
    } else if (type === 'crypto' && state.topOrder.indexOf(id) === -1) {
      job = API.getCoinsByIds([id], CONFIG.baseCurrency).then(function (coins) {
        indexCoins(coins);
        renderAll();
      });
    }

    if (job) {
      job.catch(function (err) {
        UI.setMeta('fav-meta', 'Fiyat alınamadı: ' + err.message);
      });
    }
  }

  /* --- Canlı döngü --- */

  // Geri sayım göstergesi: kripto bir sonraki yenilemeye kaç sn kaldı
  function tick() {
    if (loading || document.hidden) return;
    var left = Math.max(0, Math.round((nextCryptoAt - Date.now()) / 1000));
    UI.setLive('live', 'Canlı · ' + left + ' sn');
  }

  function finishRefresh() {
    loading = false;
    nextCryptoAt = Date.now() + CONFIG.refresh.cryptoMs;
    tick();
  }

  function refreshCrypto() {
    loading = true;
    UI.setLive('loading', 'Güncelleniyor…');
    return loadCrypto().then(finishRefresh, finishRefresh);
  }

  function refreshAll() {
    loading = true;
    UI.setLive('loading', 'Güncelleniyor…');
    return Promise.all([loadFx(), loadCrypto()]).then(finishRefresh, finishRefresh);
  }

  function startTimers() {
    stopTimers();
    timers.crypto = setInterval(refreshCrypto, CONFIG.refresh.cryptoMs);
    timers.fx = setInterval(loadFx, CONFIG.refresh.fxMs);
    timers.tick = setInterval(tick, 1000);
    nextCryptoAt = Date.now() + CONFIG.refresh.cryptoMs;
    tick();
  }

  function stopTimers() {
    Object.keys(timers).forEach(function (k) {
      if (timers[k]) { clearInterval(timers[k]); timers[k] = null; }
    });
  }

  /* Sekme arka plandayken istek atmıyoruz: CoinGecko'nun dakikalık limitini boşa harcamanın
     anlamı yok, kullanıcı zaten ekrana bakmıyor. İstisna: aktif alarm varsa zamanlayıcılar
     çalışmaya devam eder, yoksa alarm sekme kapalıyken hiç tetiklenemez. (Tarayıcı arka plandaki
     zamanlayıcıları yavaşlatabilir, bu yüzden alarm birkaç saniye geç gelebilir.) */
  function onVisibilityChange() {
    if (document.hidden) {
      if (Alarms.active().length) {
        UI.setLive('live', 'Arka planda · alarm açık');
        return;
      }
      stopTimers();
      UI.setLive('paused', 'Duraklatıldı');
      return;
    }
    AlarmUI.clearBadge();
    var stale = Date.now() - lastCryptoAt > CONFIG.refresh.cryptoMs;
    startTimers();
    if (stale) refreshCrypto();
  }

  function init() {
    try {
      Theme.init();
      Favorites.load();
      Alarms.load();
      UI.setFavoriteHandler(onToggleFavorite);
      UI.setReorderHandler(onReorderFavorite);
      UI.setDragEndHandler(function () { if (favRenderPending) renderFavorites(); });
      UI.setChartHandler(ChartView.open);
      ChartView.init();
      Search.init(onToggleFavorite);
      AlarmUI.init({ getPrice: priceOf, onChange: onAlarmsChanged });
      UI.setAlarmHandler(AlarmUI.open);
      ServerSync.init({ onServerTriggered: onServerTriggered });
      // Bağlantı geri gelince hemen tazele (çevrimdışıyken durmuş olan istekler yerine)
      PWA.init({ onOnline: function () { if (!loading) refreshAll(); } });

      // Ad listesi arama için; gelmezse arama Türkçe adlarla çalışmaya devam eder
      API.getCurrencies().then(function (names) {
        state.fxNames = names;
        Search.setEnglishNames(names);
        renderFavorites();
      }).catch(function () {});

      UI.renderSkeleton('fx-list', CONFIG.currencies.length);
      UI.renderSkeleton('crypto-list', CONFIG.topCoinCount);
      renderFavorites();

      UI.el('refresh-btn').addEventListener('click', function () {
        if (!loading) refreshAll();
      });
      document.addEventListener('visibilitychange', onVisibilityChange);

      /* Sayaç veri gelmeden de dönsün: böylece "geri sayım yok" ile
         "veri gelmiyor" birbirinden ayrılabiliyor. */
      startTimers();
      refreshAll();
    } catch (err) {
      showFatal(err.message);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
