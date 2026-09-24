/* Koyu / açık tema. Seçim yoksa sistem temasını izler; düğmeyle seçilince kaydedilir. */
var Theme = (function () {

  var root = document.documentElement;

  function systemTheme() {
    var light = typeof window.matchMedia === 'function' &&
                window.matchMedia('(prefers-color-scheme: light)').matches;
    return light ? 'light' : 'dark';
  }

  // data-theme varsa kullanıcı seçmiştir, yoksa sistem ne diyorsa o
  function current() {
    return root.getAttribute('data-theme') || systemTheme();
  }

  // Düğme, tıklanınca GEÇİLECEK temayı gösterir: koyudayken ☀, açıktayken ☾
  function paintButton() {
    var b = document.getElementById('theme-btn');
    if (!b) return;
    var dark = current() === 'dark';
    var label = dark ? 'Açık temaya geç' : 'Koyu temaya geç';
    b.textContent = dark ? '☀' : '☾';
    b.title = label;
    b.setAttribute('aria-label', label);
  }

  function set(theme) {
    root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(CONFIG.themeKey, theme);
    } catch (e) {
      // Kaydedilemese de tema bu oturumda değişmiş olur
    }
    paintButton();
  }

  function toggle() {
    set(current() === 'dark' ? 'light' : 'dark');
  }

  function init() {
    var b = document.getElementById('theme-btn');
    if (b) b.addEventListener('click', toggle);
    paintButton();

    // Kullanıcı seçim yapmadıysa sistem teması değişince simge de güncellensin
    if (typeof window.matchMedia === 'function') {
      var mq = window.matchMedia('(prefers-color-scheme: light)');
      if (mq.addEventListener) mq.addEventListener('change', paintButton);
    }
  }

  return { init: init, toggle: toggle, current: current };
})();
