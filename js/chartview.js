/* Favori kartına tıklayınca açılan, son 7 günü gösteren grafik penceresi (Chart.js). */
var ChartView = (function () {

  var chart = null;
  var requestId = 0;     // hızlı art arda tıklamada eski yanıtın yenisinin üstüne çizilmesini engeller
  var lastFocus = null;
  var cache = {};

  // Aynı parite kısa süre içinde tekrar açılırsa API'ye gitmeden önbellekten çiziyoruz.
  var TTL = { fx: 600000, crypto: 60000 };

  function el(id) {
    return document.getElementById(id);
  }

  function isoDaysAgo(days) {
    var d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  }

  function cssVar(name, fallback) {
    if (typeof getComputedStyle !== 'function') return fallback;
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return v && v.trim() ? v.trim() : fallback;
  }

  // Canvas'ta color-mix çalışmadığı için "#rrggbb" -> "rgba(r,g,b,a)"
  function withAlpha(color, alpha) {
    var m = /^#([0-9a-f]{6})$/i.exec(color);
    if (!m) return color;
    var n = parseInt(m[1], 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
  }

  /* --- Veri --- */

  function fetchHistory(type, id) {
    var key = type + ':' + id;
    var hit = cache[key];
    if (hit && Date.now() - hit.at < TTL[type]) return Promise.resolve(hit.points);

    var request = type === 'fx'
      ? API.getRateHistory(id, CONFIG.baseCurrency, isoDaysAgo(7), '')
      : API.getCoinHistory(id, CONFIG.baseCurrency, 7);

    return request.then(function (points) {
      points = points.filter(function (pt) {
        return pt.value !== null && pt.value !== undefined && !isNaN(pt.value);
      });
      cache[key] = { at: Date.now(), points: points };
      return points;
    });
  }

  function labelOf(pt) {
    if (pt.time) {
      return new Intl.DateTimeFormat('tr-TR', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
      }).format(new Date(pt.time));
    }
    var p = pt.date.split('-');
    return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' })
      .format(new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
  }

  /* Dar aralıklı verilerde (ör. USD 48,80-48,83) ondalık az kalırsa eksende
     aynı sayı tekrar tekrar yazılır; aralığa göre basamak sayısını artırıyoruz. */
  function axisDecimals(min, max) {
    var d = Math.abs(max) >= 1000 ? 0 : (Math.abs(max) >= 10 ? 2 : 4);
    var range = max - min;
    if (range > 0) {
      var need = Math.ceil(-Math.log10(range / 4));
      d = Math.max(d, Math.min(8, need));
    }
    return d;
  }

  /* --- Çizim --- */

  function destroyChart() {
    if (chart) {
      chart.destroy();
      chart = null;
    }
  }

  function showMessage(text, isError) {
    var msg = el('chart-msg');
    msg.textContent = text;
    msg.className = isError ? 'error' : 'placeholder';
    msg.hidden = false;
    el('chart-canvas').hidden = true;
  }

  function statBlock(label, value, trend) {
    var box = document.createElement('div');
    box.className = 'stat';

    var l = document.createElement('span');
    l.className = 'stat-label';
    l.textContent = label;

    var v = document.createElement('span');
    v.className = 'stat-value';
    v.textContent = value;
    if (trend) v.setAttribute('data-trend', trend);

    box.appendChild(l);
    box.appendChild(v);
    return box;
  }

  function renderStats(points) {
    var values = points.map(function (p) { return p.value; });
    var first = values[0];
    var last = values[values.length - 1];
    var pct = first ? ((last - first) / first) * 100 : null;
    var trend = pct > 0 ? 'up' : (pct < 0 ? 'down' : 'flat');

    var box = el('chart-stats');
    box.innerHTML = '';
    box.appendChild(statBlock('Son', UI.formatMoney(last)));
    box.appendChild(statBlock('7 günlük değişim', UI.formatPct(pct), trend));
    box.appendChild(statBlock('En yüksek', UI.formatMoney(Math.max.apply(null, values))));
    box.appendChild(statBlock('En düşük', UI.formatMoney(Math.min.apply(null, values))));
    return trend;
  }

  function draw(type, points) {
    if (typeof Chart === 'undefined') {
      throw new Error('Grafik kütüphanesi (Chart.js) yüklenemedi. İnternet bağlantını kontrol edip sayfayı yenile.');
    }

    var trend = renderStats(points);
    var values = points.map(function (p) { return p.value; });
    var labels = points.map(labelOf);

    var lineColor = trend === 'down' ? cssVar('--down', '#f2616b') : cssVar('--up', '#3ecf8e');
    var textColor = cssVar('--muted', '#8b97a6');
    var gridColor = cssVar('--border', '#2a323c');
    var decimals = axisDecimals(Math.min.apply(null, values), Math.max.apply(null, values));
    var tooltipDecimals = type === 'fx' ? 4 : undefined;

    el('chart-msg').hidden = true;
    el('chart-canvas').hidden = false;
    destroyChart();

    chart = new Chart(el('chart-canvas'), {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          data: values,
          borderColor: lineColor,
          backgroundColor: withAlpha(lineColor, 0.12),
          borderWidth: 2,
          fill: true,
          tension: 0.25,
          pointRadius: points.length <= 12 ? 3 : 0,
          pointHoverRadius: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 250 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) { return UI.formatMoney(ctx.parsed.y, null, tooltipDecimals); }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: textColor, maxTicksLimit: 6, maxRotation: 0 }
          },
          y: {
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              callback: function (v) { return UI.formatMoney(v, null, decimals); }
            }
          }
        }
      }
    });
  }

  /* --- Aç / kapat --- */

  function open(type, id, title) {
    var token = ++requestId;
    lastFocus = document.activeElement;

    el('chart-title').textContent = title;
    el('chart-sub').textContent = type === 'fx'
      ? 'Son 7 gün · günlük kurlar (yalnızca iş günleri yayınlanır)'
      : 'Son 7 gün · saatlik fiyat';
    el('chart-stats').innerHTML = '';
    destroyChart();
    showMessage('Grafik yükleniyor…', false);

    el('chart-modal').hidden = false;
    if (document.body) document.body.style.overflow = 'hidden';
    el('chart-close').focus();

    fetchHistory(type, id)
      .then(function (points) {
        if (token !== requestId) return;   // bu arada kapatıldı veya başka parite açıldı
        if (points.length < 2) throw new Error('Grafik için yeterli veri yok.');
        draw(type, points);
      })
      .catch(function (err) {
        if (token !== requestId) return;
        showMessage(err.message, true);
      });
  }

  function close() {
    requestId++;
    destroyChart();
    el('chart-modal').hidden = true;
    if (document.body) document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    lastFocus = null;
  }

  function isOpen() {
    return !el('chart-modal').hidden;
  }

  function init() {
    el('chart-close').addEventListener('click', close);
    el('chart-backdrop').addEventListener('click', close);

    document.addEventListener('keydown', function (e) {
      if (!isOpen()) return;
      if (e.key === 'Escape') {
        close();
      } else if (e.key === 'Tab') {
        // Pencerede odaklanabilir tek öğe kapat düğmesi; odak arkadaki sayfaya kaçmasın
        e.preventDefault();
        el('chart-close').focus();
      }
    });
  }

  return { init: init, open: open, close: close, isOpen: isOpen };
})();
