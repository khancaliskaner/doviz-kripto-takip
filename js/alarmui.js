/* Alarm arayüzü: kurma penceresi, Fiyat Alarmları paneli, tetiklenince çıkan uyarılar.
   Mantık js/alarms.js'te; buradaki her şey ekrana çizmek ve kullanıcıyı haberdar etmek. */
var AlarmUI = (function () {

  // app.js'ten gelen bağlantılar: getPrice(type, id) -> güncel fiyat | null, onChange()
  var hooks = { getPrice: function () { return null; }, onChange: function () {} };
  var current = null;      // pencere açıkken { type, id, title }
  var lastFocus = null;
  var baseTitle = '';
  var MAX_BANNERS = 5;

  var WORD = {
    above: { will: 'yükselince', did: 'yükseldi' },
    below: { will: 'düşünce', did: 'düştü' }
  };

  function el(id) {
    return document.getElementById(id);
  }

  function money(v) {
    return UI.formatMoney(v);
  }

  // "₺4.200.000 seviyesine yükselince"
  function describe(alarm) {
    return money(alarm.target) + ' seviyesine ' + WORD[alarm.direction].will;
  }

  function make(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  /* --- Ortak satır: pencere ve panel aynı görünümü kullanıyor --- */

  function alarmRow(alarm, showName) {
    var row = make('div', 'alarm-item');
    row.setAttribute('data-state', alarm.triggeredAt ? 'triggered' : 'active');

    var text = make('div', 'card-title');
    text.appendChild(make('span', 'card-name', showName ? alarm.title : describe(alarm)));

    var sub;
    if (alarm.triggeredAt) {
      sub = (showName ? describe(alarm) + ' · ' : '') + 'tetiklendi ' +
            UI.formatTime(new Date(alarm.triggeredAt)) + ' · o an ' + money(alarm.triggeredPrice);
    } else {
      var price = hooks.getPrice(alarm.type, alarm.itemId);
      sub = (showName ? describe(alarm) + ' · ' : '') + 'şu an ' + money(price);
    }
    text.appendChild(make('span', 'card-sub', sub));
    row.appendChild(text);

    row.appendChild(make('span', 'alarm-state', alarm.triggeredAt ? 'Tetiklendi' : 'Aktif'));

    var del = make('button', 'add-btn', 'Sil');
    del.type = 'button';
    del.setAttribute('aria-label', alarm.title + ' alarmını sil');
    del.addEventListener('click', function () {
      Alarms.remove(alarm.id);
      hooks.onChange();
      renderDialog();
    });
    row.appendChild(del);

    return row;
  }

  /* --- Fiyat Alarmları paneli --- */

  function renderPanel() {
    var box = el('alarm-list');
    if (!box) return;
    box.innerHTML = '';

    var all = Alarms.list();
    var activeCount = Alarms.active().length;
    var triggeredCount = all.length - activeCount;

    var meta = el('alarm-meta');
    if (meta) {
      meta.textContent = all.length
        ? activeCount + ' aktif · ' + triggeredCount + ' tetiklendi'
        : '';
      if (!Alarms.isWritable()) {
        meta.textContent += ' · tarayıcı kaydetmeye izin vermiyor, alarmlar sayfa yenilenince kaybolur';
      }
    }

    if (!all.length) {
      box.appendChild(make('p', 'placeholder',
        'Henüz alarm yok. Bir kartın altındaki 🔔 Alarm düğmesiyle hedef fiyat belirle.'));
      return;
    }

    all.forEach(function (a) { box.appendChild(alarmRow(a, true)); });

    if (triggeredCount) {
      var clear = make('button', 'add-btn alarm-clear', 'Tetiklenenleri temizle');
      clear.type = 'button';
      clear.addEventListener('click', function () {
        Alarms.clearTriggered();
        hooks.onChange();
      });
      box.appendChild(clear);
    }
  }

  /* --- Kurma penceresi --- */

  // Girilen değeri yorumlar, önizleme yazısını günceller. Geçerliyse { target, price } döner.
  function updatePreview() {
    var box = el('alarm-preview');
    var raw = el('alarm-target').value.trim();
    box.className = 'panel-meta';

    if (!raw) {
      box.textContent = 'Hedef fiyatı yaz; fiyat o seviyeye ulaşınca haber vereyim.';
      return null;
    }

    var target = Alarms.parsePrice(raw);
    if (target === null) {
      box.className = 'error';
      box.textContent = 'Sayı olarak anlayamadım. Örn: 4.200.000 veya 48,5';
      return null;
    }

    var price = hooks.getPrice(current.type, current.id);
    if (!(price > 0)) {
      box.textContent = 'Güncel fiyat henüz yüklenmedi.';
      return null;
    }

    var dir = Alarms.directionFor(target, price);
    var pct = ((target - price) / price) * 100;
    box.textContent = 'Hedef ' + money(target) + ' → fiyat ' + WORD[dir].will +
      ' bildirilir (şu an ' + money(price) + ', ' + UI.formatPct(pct) + ' uzakta).';
    return { target: target, price: price };
  }

  function permissionSupported() {
    return typeof Notification !== 'undefined';
  }

  function renderPermission() {
    var note = el('alarm-perm');
    var btn = el('alarm-perm-btn');
    btn.hidden = true;

    var serverOn = typeof ServerSync !== 'undefined' && ServerSync.getStatus() === 'on';
    var text = serverOn
      ? 'Sunucu takibi açık: sekme kapalıyken de alarmlar izlenir. '
      : 'Alarmlar yalnızca bu sayfa bir sekmede açıkken kontrol edilir. ';
    if (!permissionSupported()) {
      text += 'Bu tarayıcı bildirim desteklemiyor; uyarı sayfada görünür.';
    } else if (Notification.permission === 'granted') {
      text += 'Tarayıcı bildirimleri açık, sekme arka plandayken de haber verilir.';
    } else if (Notification.permission === 'denied') {
      text += 'Tarayıcı bildirimleri engelli; uyarı yalnızca sayfada görünür.';
    } else {
      text += 'Sekme arka plandayken de haber alabilmek için bildirim izni ver.';
      btn.hidden = false;
    }
    note.textContent = text;
  }

  function askPermission() {
    if (!permissionSupported() || Notification.permission !== 'default') return;
    try {
      // Eski tarayıcılar geri çağrı, yenileri Promise kullanıyor
      var result = Notification.requestPermission(renderPermission);
      if (result && result.then) result.then(renderPermission);
    } catch (e) {
      renderPermission();
    }
  }

  function renderDialog() {
    if (!current) return;

    var price = hooks.getPrice(current.type, current.id);
    el('alarm-title').textContent = '🔔 Alarm · ' + current.title;
    el('alarm-price').textContent = 'Güncel fiyat: ' + money(price);

    var box = el('alarm-existing');
    box.innerHTML = '';
    Alarms.forItem(current.type, current.id).forEach(function (a) {
      box.appendChild(alarmRow(a, false));
    });

    updatePreview();
    renderPermission();
  }

  function open(type, id, title) {
    current = { type: type, id: id, title: title };
    lastFocus = document.activeElement;
    el('alarm-target').value = '';
    el('alarm-modal').hidden = false;
    if (document.body) document.body.style.overflow = 'hidden';
    renderDialog();
    el('alarm-target').focus();
  }

  function close() {
    current = null;
    el('alarm-modal').hidden = true;
    if (document.body) document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    lastFocus = null;
  }

  function isOpen() {
    return !el('alarm-modal').hidden;
  }

  function onSubmit(e) {
    e.preventDefault();
    var p = updatePreview();
    if (!p) return;

    var res = Alarms.add(current.type, current.id, current.title, p.target, p.price);
    if (res.error) {
      var box = el('alarm-preview');
      box.className = 'error';
      box.textContent = res.error;
      return;
    }

    el('alarm-target').value = '';
    askPermission();     // ilk alarmda kullanıcı hareketi içinde izin isteniyor
    hooks.onChange();
    renderDialog();
  }

  /* --- Tetiklenince haber verme --- */

  function addBanner(text) {
    var bar = el('alert-bar');
    if (!bar) return;

    var item = make('div', 'alert');
    item.setAttribute('role', 'alert');
    item.appendChild(make('span', 'alert-text', '🔔 ' + text));

    var dismiss = make('button', 'icon-btn', '✕');
    dismiss.type = 'button';
    dismiss.setAttribute('aria-label', 'Uyarıyı kapat');
    dismiss.addEventListener('click', function () { item.remove(); });
    item.appendChild(dismiss);

    bar.appendChild(item);
    // Çok sayıda alarm birden tetiklenirse ekranı kaplamasın: en eskileri at
    while (bar.children.length > MAX_BANNERS) bar.children[0].remove();
  }

  /* opts.server: alarm sayfa kapalıyken/arka plandayken SUNUCU tarafından yakalandı. Service worker
     zaten bir tarayıcı bildirimi göstermiştir; burada yalnızca sayfa içi uyarı çıkar. */
  function notify(fired, opts) {
    var fromServer = !!(opts && opts.server);

    fired.forEach(function (a) {
      var text = a.title + ': ' + money(a.target) + ' seviyesine ' + WORD[a.direction].did +
                 '. Şu an ' + money(a.triggeredPrice);
      addBanner(fromServer ? text + ' (sunucu yakaladı)' : text);
      if (fromServer) return;

      try {
        if (permissionSupported() && Notification.permission === 'granted') {
          new Notification('🔔 Fiyat alarmı', { body: text, tag: a.id });
        }
      } catch (e) {
        // Bazı ortamlarda Notification kurucusu hata veriyor; sayfa içi uyarı zaten gösterildi
      }
    });

    if (fired.length && document.hidden) {
      document.title = '🔔 (' + fired.length + ') ' + baseTitle;
    }
  }

  // Kullanıcı sekmeye dönünce başlıktaki 🔔 rozeti kalksın
  function clearBadge() {
    if (baseTitle) document.title = baseTitle;
  }

  /* --- Kurulum --- */

  function init(h) {
    hooks = h;
    baseTitle = document.title;

    el('alarm-close').addEventListener('click', close);
    el('alarm-backdrop').addEventListener('click', close);
    el('alarm-form').addEventListener('submit', onSubmit);
    el('alarm-target').addEventListener('input', updatePreview);
    el('alarm-perm-btn').addEventListener('click', askPermission);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) close();
    });

    renderPanel();
  }

  // Veri yenilenince açık penceredeki ve paneldeki "şu an" fiyatları güncellensin
  function refresh() {
    renderPanel();
    renderDialog();
  }

  return {
    init: init,
    open: open,
    close: close,
    isOpen: isOpen,
    notify: notify,
    clearBadge: clearBadge,
    renderPanel: renderPanel,
    refresh: refresh
  };
})();
