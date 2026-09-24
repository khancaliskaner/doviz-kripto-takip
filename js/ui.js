/* Biçimlendirme, kart üretimi ve DOM yardımcıları. */
var UI = (function () {

  // Yıldıza / karta tıklanınca app.js'in haberdar olması için
  var favoriteHandler = null;
  var chartHandler = null;
  var alarmHandler = null;
  var reorderHandler = null;
  var dragEndHandler = null;
  var dragKey = null;          // sürüklenen favorinin "tip:kimlik" anahtarı, sürükleme yokken null

  function el(id) {
    return document.getElementById(id);
  }

  /* Büyüklüğe göre ondalık basamak seçiyoruz: 4.127.571 ₺ ile 4,5200 ₺
     aynı kuralla okunaklı çıkmıyor. */
  function decimalsFor(value) {
    var v = Math.abs(value);
    if (v >= 1000) return 0;
    if (v >= 10) return 2;
    if (v >= 0.01) return 4;
    return 8;
  }

  function formatMoney(value, currency, decimals) {
    if (value === null || value === undefined || isNaN(value)) return '—';
    var d = typeof decimals === 'number' ? decimals : decimalsFor(value);
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: currency || CONFIG.baseCurrency,
      minimumFractionDigits: d,
      maximumFractionDigits: d
    }).format(value);
  }

  // 2190396631226 -> "2,19 Tn ₺"
  function formatCompact(value) {
    if (value === null || value === undefined || isNaN(value)) return '—';
    return new Intl.NumberFormat('tr-TR', {
      notation: 'compact',
      maximumFractionDigits: 2
    }).format(value) + ' ₺';
  }

  // -1.915 -> "-1,92%"
  function formatPct(value) {
    if (value === null || value === undefined || isNaN(value)) return '—';
    var sign = value > 0 ? '+' : '';
    return sign + new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value) + '%';
  }

  function trendOf(value) {
    if (value === null || value === undefined || isNaN(value)) return 'flat';
    if (value > 0) return 'up';
    if (value < 0) return 'down';
    return 'flat';
  }

  // '2026-09-23' -> '23 Eylül 2026'
  function formatDate(isoDate) {
    if (!isoDate) return '—';
    var p = isoDate.split('-');
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  }

  function formatTime(date) {
    return new Intl.DateTimeFormat('tr-TR', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).format(date || new Date());
  }

  /* --- Kart parçaları --- */

  function setFavoriteHandler(fn) {
    favoriteHandler = fn;
  }

  function setChartHandler(fn) {
    chartHandler = fn;
  }

  function setAlarmHandler(fn) {
    alarmHandler = fn;
  }

  function setReorderHandler(fn) {
    reorderHandler = fn;
  }

  function setDragEndHandler(fn) {
    dragEndHandler = fn;
  }

  // Sürükleme sürerken app.js favori kartlarını yeniden çizmesin (kaynak kart DOM'dan kopar)
  function isDragging() {
    return dragKey !== null;
  }

  // className üzerinden sınıf ekle/çıkar (classList'e bağımlı kalmadan)
  function setClass(node, cls, on) {
    var parts = String(node.className || '').split(' ').filter(Boolean);
    var i = parts.indexOf(cls);
    if (on && i === -1) parts.push(cls);
    if (!on && i !== -1) parts.splice(i, 1);
    node.className = parts.join(' ');
  }

  /* Favori kartlarına sıralama: ◀ ▶ düğmeleri (dokunmatik ve klavye için) + masaüstünde
     sürükle-bırak. HTML5 sürükle-bırak telefonlarda güvenilir çalışmadığı için düğmeler asıl yol.
     fav = { index, count }: ekranda görünen favoriler içindeki yeri. */
  function makeReorderable(card, actions, type, id, fav) {
    var myKey = type + ':' + id;
    card.setAttribute('data-fav-type', type);
    card.setAttribute('data-fav-id', id);
    card.setAttribute('draggable', 'true');

    var box = document.createElement('div');
    box.className = 'reorder';
    [
      { dir: -1, text: '◀', label: 'Bir öne taşı', disabled: fav.index === 0 },
      { dir: 1, text: '▶', label: 'Bir sona taşı', disabled: fav.index === fav.count - 1 }
    ].forEach(function (d) {
      var b = document.createElement('button');
      b.className = 'reorder-btn';
      b.type = 'button';
      b.textContent = d.text;
      b.disabled = d.disabled;
      b.setAttribute('data-dir', String(d.dir));
      b.setAttribute('aria-label', d.label);
      b.title = d.label;
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        if (reorderHandler) reorderHandler(type, id, { dir: d.dir });
      });
      box.appendChild(b);
    });
    actions.appendChild(box);

    card.addEventListener('dragstart', function (e) {
      dragKey = myKey;
      setClass(card, 'dragging', true);
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', myKey); } catch (x) { /* Firefox için, yoksa sürükleme başlamaz */ }
      }
    });
    card.addEventListener('dragover', function (e) {
      if (dragKey === null || dragKey === myKey) return;
      e.preventDefault();                                   // bırakmaya izin ver
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      setClass(card, 'drop-target', true);
    });
    card.addEventListener('dragleave', function () {
      setClass(card, 'drop-target', false);
    });
    card.addEventListener('drop', function (e) {
      e.preventDefault();
      setClass(card, 'drop-target', false);
      var src = dragKey;
      dragKey = null;
      if (!src || src === myKey) return;
      var i = src.indexOf(':');
      if (reorderHandler) reorderHandler(src.slice(0, i), src.slice(i + 1), { beforeType: type, beforeId: id });
    });
    card.addEventListener('dragend', function () {
      setClass(card, 'dragging', false);
      dragKey = null;
      if (dragEndHandler) dragEndHandler();                 // sürükleme sırasında ertelenen çizimi yap
    });
  }

  function descendants(node, out) {
    for (var i = 0; i < node.children.length; i++) {
      out.push(node.children[i]);
      descendants(node.children[i], out);
    }
    return out;
  }

  /* ◀ ▶ ile taşıyınca kartlar yeniden çizilir, odak kaybolur. Aynı parite kartında aynı yöndeki
     düğmeye (o yön artık bitmişse diğerine) odağı geri veriyoruz; klavye kullanıcısı arka arkaya basabilsin. */
  function focusFavorite(type, id, dir) {
    var box = el('fav-list');
    if (!box) return;
    for (var i = 0; i < box.children.length; i++) {
      var card = box.children[i];
      if (card.getAttribute('data-fav-type') !== type || card.getAttribute('data-fav-id') !== id) continue;

      var btns = descendants(card, []).filter(function (n) { return n.className === 'reorder-btn'; });
      var pick = btns.filter(function (b) { return b.getAttribute('data-dir') === String(dir) && !b.disabled })[0] ||
                 btns.filter(function (b) { return !b.disabled; })[0];
      if (pick && pick.focus) pick.focus();
      return;
    }
  }

  /* Her kartta aynı iki eylem: 📈 Grafik ve 🔔 Alarm. Karta tıklayınca da grafik açılır.
     "Grafik" düğmesi ayrıca dinleyici taşımıyor: tıklama karta kabarcıklanıyor, klavyeyle
     Enter/Boşluk da aynı yolu izliyor. Yıldız ve Alarm düğmeleri stopPropagation yaptığı için
     grafik açmıyor. */
  function addActions(card, type, id, title, fav) {
    card.setAttribute('data-chartable', 'true');
    card.addEventListener('click', function () {
      if (chartHandler) chartHandler(type, id, title);
    });

    var actions = document.createElement('div');
    actions.className = 'card-actions';

    var chart = document.createElement('button');
    chart.className = 'chart-btn';
    chart.type = 'button';
    chart.textContent = '📈 Grafik';
    chart.setAttribute('aria-label', title + ' 7 günlük grafiği');
    actions.appendChild(chart);

    var n = Alarms.activeCount(type, id);
    var alarm = document.createElement('button');
    alarm.className = 'alarm-btn';
    alarm.type = 'button';
    alarm.textContent = n ? '🔔 Alarm (' + n + ')' : '🔔 Alarm';
    alarm.setAttribute('data-active', n ? 'true' : 'false');
    alarm.setAttribute('aria-label', title + (n ? ' için ' + n + ' aktif alarm, düzenle' : ' için fiyat alarmı kur'));
    alarm.addEventListener('click', function (e) {
      e.stopPropagation();
      if (alarmHandler) alarmHandler(type, id, title);
    });
    actions.appendChild(alarm);

    if (fav) makeReorderable(card, actions, type, id, fav);
    card.appendChild(actions);
  }

  function starButton(type, id) {
    var on = Favorites.has(type, id);
    var b = document.createElement('button');
    b.className = 'star';
    b.type = 'button';
    b.textContent = on ? '★' : '☆';
    b.setAttribute('data-on', on ? 'true' : 'false');
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    var label = on ? 'Favorilerden çıkar' : 'Favorilere ekle';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.addEventListener('click', function (e) {
      e.stopPropagation();   // kartın grafik açma tıklaması tetiklenmesin
      if (favoriteHandler) favoriteHandler(type, id);
    });
    return b;
  }

  // Kart başlığı: ad + altında küçük açıklama
  function titleBlock(name, sub) {
    var box = document.createElement('div');
    box.className = 'card-title';

    var nameEl = document.createElement('span');
    nameEl.className = 'card-name';
    nameEl.textContent = name;

    var subEl = document.createElement('span');
    subEl.className = 'card-sub';
    subEl.textContent = sub;

    box.appendChild(nameEl);
    box.appendChild(subEl);
    return box;
  }

  function changeBadge(pct, label) {
    var span = document.createElement('span');
    span.className = 'change';
    span.setAttribute('data-trend', trendOf(pct));
    span.textContent = formatPct(pct) + (label ? ' ' + label : '');
    return span;
  }

  /* --- Kartlar --- */

  function currencyCard(currency, rate, opts) {
    var card = document.createElement('article');
    card.className = 'card';
    card.setAttribute('data-kind', 'fx');
    card.setAttribute('data-code', currency.code);

    var head = document.createElement('div');
    head.className = 'card-head';

    var badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = currency.code;

    head.appendChild(badge);
    head.appendChild(titleBlock(currency.name, '1 ' + currency.code + ' karşılığı'));
    head.appendChild(starButton('fx', currency.code));

    var price = document.createElement('div');
    price.className = 'card-price';
    price.textContent = formatMoney(rate.value);

    var foot = document.createElement('div');
    foot.className = 'card-foot';
    foot.appendChild(changeBadge(rate.changePct, 'günlük'));

    card.appendChild(head);
    card.appendChild(price);
    card.appendChild(foot);
    addActions(card, 'fx', currency.code, currency.code + '/TRY', opts && opts.fav);
    return card;
  }

  function coinCard(coin, opts) {
    var card = document.createElement('article');
    card.className = 'card';
    card.setAttribute('data-kind', 'crypto');
    card.setAttribute('data-id', coin.id);

    var head = document.createElement('div');
    head.className = 'card-head';

    var img = document.createElement('img');
    img.className = 'coin-logo';
    img.src = coin.image;
    img.alt = '';
    img.loading = 'lazy';
    img.width = 32;
    img.height = 32;

    head.appendChild(img);
    head.appendChild(titleBlock(coin.name, coin.symbol + (coin.rank ? ' · #' + coin.rank : '')));
    head.appendChild(starButton('crypto', coin.id));

    var price = document.createElement('div');
    price.className = 'card-price';
    price.textContent = formatMoney(coin.price);

    var foot = document.createElement('div');
    foot.className = 'card-foot';
    foot.appendChild(changeBadge(coin.changePct, '24s'));

    var vol = document.createElement('span');
    vol.className = 'card-meta';
    vol.textContent = 'Hacim ' + formatCompact(coin.volume);
    foot.appendChild(vol);

    card.appendChild(head);
    card.appendChild(price);
    card.appendChild(foot);
    addActions(card, 'crypto', coin.id, coin.name + ' (' + coin.symbol + ')', opts && opts.fav);
    return card;
  }

  /* --- Bölüm durumları --- */

  function renderSkeleton(containerId, count) {
    var box = el(containerId);
    if (!box) return;
    box.innerHTML = '';
    for (var i = 0; i < count; i++) {
      var s = document.createElement('div');
      s.className = 'card skeleton';
      box.appendChild(s);
    }
  }

  function renderCards(containerId, cards) {
    var box = el(containerId);
    if (!box) return;
    box.innerHTML = '';
    cards.forEach(function (c) { box.appendChild(c); });
  }

  function showMessage(containerId, message, className) {
    var box = el(containerId);
    if (!box) return;
    box.innerHTML = '';
    var p = document.createElement('p');
    p.className = className || 'placeholder';
    p.textContent = message;
    box.appendChild(p);
  }

  function showError(containerId, message) {
    showMessage(containerId, message, 'error');
  }

  function setMeta(id, text) {
    var node = el(id);
    if (node) node.textContent = text;
  }

  /* Canlı göstergesi: state = 'live' | 'loading' | 'paused' | 'error' */
  function setLive(state, text) {
    var box = el('live-indicator');
    var label = el('live-text');
    if (box) box.setAttribute('data-state', state);
    if (label) label.textContent = text;
  }

  return {
    el: el,
    formatMoney: formatMoney,
    formatCompact: formatCompact,
    formatPct: formatPct,
    formatDate: formatDate,
    formatTime: formatTime,
    setFavoriteHandler: setFavoriteHandler,
    setChartHandler: setChartHandler,
    setAlarmHandler: setAlarmHandler,
    setReorderHandler: setReorderHandler,
    setDragEndHandler: setDragEndHandler,
    isDragging: isDragging,
    focusFavorite: focusFavorite,
    currencyCard: currencyCard,
    coinCard: coinCard,
    renderSkeleton: renderSkeleton,
    renderCards: renderCards,
    showMessage: showMessage,
    showError: showError,
    setMeta: setMeta,
    setLive: setLive
  };
})();
