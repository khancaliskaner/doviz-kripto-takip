/* Telefona/bilgisayara uygulama olarak kurulabilme (PWA): service worker kaydı, "Yükle" düğmesi,
   iPhone için ipucu ve çevrimdışı/çevrimiçi durumu. file:// üzerinde service worker çalışmaz;
   o durumda hiçbir şey yapmaz ve uygulamanın geri kalanı etkilenmez. */
var PWA = (function () {

  var deferredPrompt = null;
  var hooks = { onOnline: function () {} };

  function el(id) {
    return document.getElementById(id);
  }

  /* Alarm sunucusu ayrı bir adresteyse service worker'a "?server=" ile iletilir (bkz. sw.js).
     js/serversync.js de aynı adresi kullanır; iki kayıt farklı adresle yapılırsa tarayıcı
     service worker'ı sürekli yeniden kurar. */
  function swPath() {
    return 'sw.js' + (CONFIG.serverUrl ? '?server=' + encodeURIComponent(CONFIG.serverUrl) : '');
  }

  function canRegister() {
    return typeof navigator !== 'undefined' && 'serviceWorker' in navigator &&
           typeof location !== 'undefined' && (location.protocol === 'https:' || location.protocol === 'http:');
  }

  function isStandalone() {
    try {
      return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
             navigator.standalone === true;
    } catch (e) {
      return false;
    }
  }

  function register() {
    if (!canRegister()) return Promise.resolve(false);
    return navigator.serviceWorker.register(swPath())
      .then(function () { return true; })
      .catch(function () { return false; });   // kayıt başarısızsa uygulama yine de çalışır
  }

  /* --- Yükle düğmesi (Chrome / Edge / Android). iOS bu olayı hiç göndermez. --- */

  function showInstall(show) {
    var b = el('install-btn');
    if (b) b.hidden = !show;
  }

  function onBeforeInstallPrompt(e) {
    e.preventDefault();            // tarayıcının kendi küçük çubuğu yerine kendi düğmemizi göster
    deferredPrompt = e;
    showInstall(true);
  }

  function install() {
    if (!deferredPrompt) return Promise.resolve();
    var p = deferredPrompt;
    deferredPrompt = null;         // olay tek kullanımlık
    showInstall(false);
    p.prompt();
    return p.userChoice ? p.userChoice.catch(function () {}) : Promise.resolve();
  }

  // iPhone/iPad Safari kurulum olayı vermez; nasıl yapılacağını yazıyoruz
  function maybeShowIosHint() {
    var hint = el('install-hint');
    if (!hint || typeof navigator === 'undefined') return;
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent || '');
    if (ios && !isStandalone()) hint.hidden = false;
  }

  /* --- Bağlantı durumu --- */

  function onOffline() {
    UI.setLive('error', 'Çevrimdışı');
  }

  function onOnline() {
    UI.setLive('loading', 'Bağlandı, güncelleniyor…');
    hooks.onOnline();
  }

  function init(h) {
    hooks = h || hooks;

    if (isStandalone()) showInstall(false);

    var btn = el('install-btn');
    if (btn) btn.addEventListener('click', install);

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', function () {
      deferredPrompt = null;
      showInstall(false);
    });
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    maybeShowIosHint();
    if (typeof navigator !== 'undefined' && navigator.onLine === false) onOffline();

    return register();
  }

  return { init: init, swPath: swPath, register: register, install: install, isStandalone: isStandalone };
})();
