/* Sunucu alarmı: alarmları server/server.js ile senkronlar ve Web Push aboneliğini yönetir.
   Sunucu bulunamazsa (Live Server, GitHub Pages, file://) sessizce "kapalı" kalır; uygulamanın
   geri kalanı etkilenmez. Sunucu takibi açıkken bile alarmlar sayfada da kontrol edilmeye devam eder. */
var ServerSync = (function () {

  var status = 'checking';   // checking | unavailable | unsupported | off | on | denied | error
  var detail = '';
  var lastSyncAt = null;
  var subscription = null;
  var hooks = { onServerTriggered: function () {} };
  var running = false;
  var again = false;

  function el(id) {
    return document.getElementById(id);
  }

  function apiUrl(path) {
    return (CONFIG.serverUrl || '') + path;
  }

  function request(path, body, timeoutMs) {
    var opts = { cache: 'no-store' };
    if (body !== undefined) {
      opts.method = 'POST';
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(body);
    }
    if (typeof AbortController !== 'undefined') {
      var ctl = new AbortController();
      setTimeout(function () { ctl.abort(); }, timeoutMs || 8000);
      opts.signal = ctl.signal;
    }
    return fetch(apiUrl(path), opts).then(function (res) {
      if (!res.ok) {
        var err = new Error('Sunucu yanıtı ' + res.status);
        err.status = res.status;
        throw err;
      }
      return res.json();
    });
  }

  function supported() {
    return typeof navigator !== 'undefined' && 'serviceWorker' in navigator &&
           typeof window !== 'undefined' && 'PushManager' in window &&
           typeof Notification !== 'undefined';
  }

  function flagOn() {
    try { return localStorage.getItem(CONFIG.serverSyncKey) === '1'; } catch (e) { return false; }
  }

  function setFlag(on) {
    try {
      if (on) localStorage.setItem(CONFIG.serverSyncKey, '1');
      else localStorage.removeItem(CONFIG.serverSyncKey);
    } catch (e) {
      // Kaydedilemezse bu oturumda çalışır, yenilenince tekrar açılması gerekir
    }
  }

  // VAPID açık anahtarı base64url -> Uint8Array (subscribe bu biçimi istiyor)
  function keyBytes(b64url) {
    var pad = '='.repeat((4 - (b64url.length % 4)) % 4);
    var raw = atob((b64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function sameKey(sub, bytes) {
    var have = sub.options && sub.options.applicationServerKey;
    if (!have) return true;          // tarayıcı göstermiyorsa eşleşti say
    var a = new Uint8Array(have);
    if (a.length !== bytes.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== bytes[i]) return false;
    return true;
  }

  /* --- Ekran --- */

  var TEXT = {
    checking: 'Alarm sunucusu aranıyor…',
    unavailable: 'Sunucu alarmı kapalı: bu sayfa alarm sunucusu olmadan açılmış. Sekme kapalıyken de ' +
                 'alarm istersen baslat-sunucu.bat ile sunucuyu başlatıp http://localhost:8787 adresinden aç.',
    // GitHub Pages gibi statik bir adreste "baslat-sunucu.bat" demek yanıltıcı olur (dosya orada yok)
    unavailableHosted: 'Bu yayında alarm sunucusu yok (statik site), alarmlar yalnızca sayfa açıkken kontrol edilir. ' +
                       'Sekme kapalıyken de alarm istersen uygulamayı kendi bilgisayarında baslat-sunucu.bat ile başlatıp aç.',
    unsupported: 'Bu tarayıcı arka plan bildirimlerini (Web Push) desteklemiyor; alarmlar yalnızca sayfa açıkken çalışır.',
    off: 'Alarm sunucusu bulundu. Sunucu takibini açarsan alarmların sunucuda da izlenir ve sekmeyi kapatsan bile bildirim gelir.',
    denied: 'Bildirim izni verilmedi. Tarayıcının adres çubuğundaki site ayarlarından bildirime izin verip tekrar dene.'
  };

  var BUTTON = { off: 'Sunucuda takibi aç', denied: 'Tekrar dene', error: 'Tekrar dene', on: 'Sunucu takibini kapat' };

  function isLocalHost() {
    var h = typeof location !== 'undefined' ? location.hostname : '';
    return !h || h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
  }

  function render() {
    var line = el('server-status');
    var btn = el('server-toggle');
    if (!line || !btn) return;

    var text = TEXT[status] || '';
    if (status === 'unavailable' && !isLocalHost()) text = TEXT.unavailableHosted;
    if (status === 'on') {
      text = 'Sunucu takibi açık: ' + Alarms.active().length + ' aktif alarm sunucuda izleniyor' +
             (lastSyncAt ? ' (son senkron ' + UI.formatTime(new Date(lastSyncAt)) + ')' : '') + '.';
      if (detail) text += ' ' + detail;
    } else if (status === 'error') {
      text = detail || 'Sunucu takibi açılamadı.';
    }
    line.textContent = text;
    line.setAttribute('data-state', status);

    btn.hidden = !BUTTON[status];
    btn.textContent = BUTTON[status] || '';
  }

  function setStatus(s, d) {
    status = s;
    detail = d || '';
    render();
  }

  /* --- Abonelik --- */

  function ensureSubscription() {
    return navigator.serviceWorker.register(PWA.swPath())
      .then(function () { return navigator.serviceWorker.ready; })
      .then(function (reg) {
        return request('/api/push/key').then(function (k) {
          var bytes = keyBytes(k.publicKey);
          return reg.pushManager.getSubscription().then(function (existing) {
            if (existing && sameKey(existing, bytes)) return existing;
            // Sunucunun anahtarı değişmişse (state.json silindi) eski abonelik geçersizdir
            var cleared = existing ? existing.unsubscribe() : Promise.resolve();
            return cleared.then(function () {
              return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
            });
          });
        });
      })
      .then(function (sub) {
        subscription = sub;
        return request('/api/push/subscribe', { subscription: sub.toJSON() });
      });
  }

  function enable() {
    if (!supported()) { setStatus('unsupported'); return Promise.resolve(); }
    setStatus('checking');

    return Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') { setStatus('denied'); return; }
      return ensureSubscription().then(function () {
        setFlag(true);
        setStatus('on');
        return sync();
      });
    }).catch(function (err) {
      setStatus('error', 'Sunucu takibi açılamadı: ' + err.message);
    });
  }

  function disable() {
    var sub = subscription;
    subscription = null;
    setFlag(false);
    setStatus('off');
    if (!sub) return Promise.resolve();
    return request('/api/push/unsubscribe', { endpoint: sub.endpoint })
      .catch(function () {})
      .then(function () { return sub.unsubscribe(); })
      .catch(function () {});
  }

  /* --- Senkron --- */

  function payload() {
    return { endpoint: subscription.endpoint, alarms: Alarms.exportAll() };
  }

  function sync() {
    if (status !== 'on' || !subscription) return Promise.resolve();
    if (running) { again = true; return Promise.resolve(); }   // bitince bir kez daha çalışır
    running = true;

    return request('/api/sync', payload())
      .catch(function (err) {
        if (err.status !== 404) throw err;
        // Sunucu aboneliği unutmuş (veri klasörü silinmiş olabilir): yeniden kaydedip bir kez daha dene
        return request('/api/push/subscribe', { subscription: subscription.toJSON() })
          .then(function () { return request('/api/sync', payload()); });
      })
      .then(function (res) {
        lastSyncAt = Date.now();
        detail = '';
        var mine = (res.alarms || []).filter(function (a) {
          return (res.serverTriggered || []).indexOf(a.id) !== -1;
        });
        var changed = Alarms.applyTriggered(mine);
        if (changed.length) hooks.onServerTriggered(changed);
      })
      .catch(function (err) {
        detail = 'Sunucuya ulaşılamadı (' + err.message + '), sonraki yenilemede tekrar denenecek.';
      })
      .then(function () {
        running = false;
        render();
        if (again) { again = false; return sync(); }
      });
  }

  /* --- Başlangıç --- */

  function init(h) {
    hooks = h || hooks;
    var btn = el('server-toggle');
    if (btn) {
      btn.addEventListener('click', function () {
        if (status === 'on') disable(); else enable();
      });
    }
    render();

    // Service worker push gelince sayfayı uyandırır: hemen senkronla, uyarı şeridi çıksın
    if (typeof navigator !== 'undefined' && navigator.serviceWorker && navigator.serviceWorker.addEventListener) {
      navigator.serviceWorker.addEventListener('message', function (e) {
        if (e.data && e.data.type === 'alarm-push') sync();
      });
    }

    return request('/api/health', undefined, 3000)
      .then(function (j) { return !!(j && j.ok); })
      .catch(function () { return false; })
      .then(function (up) {
        if (!up) return setStatus('unavailable');
        if (!supported()) return setStatus('unsupported');
        if (flagOn() && Notification.permission === 'granted') {
          return ensureSubscription().then(function () {
            setStatus('on');
            return sync();
          }).catch(function (err) {
            setStatus('error', 'Sunucu takibi sürdürülemedi: ' + err.message);
          });
        }
        setStatus('off');
      });
  }

  return {
    init: init,
    enable: enable,
    disable: disable,
    sync: sync,
    render: render,
    getStatus: function () { return status; }
  };
})();
