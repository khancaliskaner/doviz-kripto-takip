/* Fiyat alarmları: saklama (localStorage), tetikleme koşulu, fiyat girdisini ayrıştırma.
   DOM'a dokunmaz; ekran tarafı js/alarmui.js'te.

   Bir alarm: { id, type: 'fx'|'crypto', itemId, title, direction: 'above'|'below',
                target, createdAt, triggeredAt, triggeredPrice }
   Yön kullanıcıdan sorulmaz: kurulduğu andaki fiyata göre hedef yukarıdaysa 'above'
   (yükselince), aşağıdaysa 'below' (düşünce) seçilir. Böylece alarm kurulur kurulmaz
   tetiklenemez. Alarm bir kez tetiklenir; tetiklenince listede kalır ama artık aktif değildir. */
var Alarms = (function () {

  var items = [];
  var writable = true;

  function newId() {
    return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function isValid(a) {
    return a && typeof a.id === 'string' &&
           (a.type === 'fx' || a.type === 'crypto') &&
           typeof a.itemId === 'string' &&
           (a.direction === 'above' || a.direction === 'below') &&
           isFinite(a.target) && a.target > 0;
  }

  /* localStorage gizli sekmede hata fırlatabiliyor; uygulama çalışmaya devam etsin. */
  function load() {
    try {
      var raw = localStorage.getItem(CONFIG.alarmsKey);
      var parsed = raw ? JSON.parse(raw) : [];
      items = Array.isArray(parsed) ? parsed.filter(isValid) : [];
    } catch (e) {
      items = [];
      writable = false;
    }
    return items;
  }

  function save() {
    try {
      localStorage.setItem(CONFIG.alarmsKey, JSON.stringify(items));
      writable = true;
    } catch (e) {
      writable = false;
    }
    return writable;
  }

  function isActive(a) {
    return !a.triggeredAt;
  }

  function directionFor(target, price) {
    return target > price ? 'above' : 'below';
  }

  /* Kullanıcı girdisi -> sayı. Türkçe ("4.200.000", "48,5") ve İngilizce ("4,200,000.5")
     yazımını, ₺ / TL ekini ve boşlukları tolere eder. Anlaşılmazsa null. */
  function parsePrice(text) {
    var s = String(text || '').replace(/TL/gi, '').replace(/[₺\s]/g, '');
    if (!/^[0-9.,]+$/.test(s)) return null;

    var hasDot = s.indexOf('.') !== -1;
    var hasComma = s.indexOf(',') !== -1;

    if (hasDot && hasComma) {
      // İkisi birden varsa sonda olan ondalık ayracıdır, diğeri binlik
      var decimal = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
      var thousands = decimal === ',' ? '.' : ',';
      s = s.split(thousands).join('').replace(decimal, '.');
    } else if (hasComma) {
      // Tek virgül ondalıktır ("48,5"); birden fazlası binliktir ("4,200,000")
      s = s.split(',').length > 2 ? s.split(',').join('') : s.replace(',', '.');
    } else if (hasDot) {
      // "4.200.000" binlik; "48.5" ondalık
      if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.split('.').join('');
    }

    var n = Number(s);
    return isFinite(n) && n > 0 ? n : null;
  }

  /* Dönen: { alarm } ya da { error } */
  function add(type, itemId, title, target, price) {
    if (!(target > 0)) return { error: 'Hedef fiyat sıfırdan büyük bir sayı olmalı.' };
    if (!(price > 0)) return { error: 'Güncel fiyat henüz yüklenmedi, birkaç saniye sonra tekrar dene.' };
    if (Math.abs(target - price) <= price * 1e-9) {
      return { error: 'Hedef, güncel fiyatla aynı. Farklı bir seviye yaz.' };
    }

    var direction = directionFor(target, price);
    var duplicate = items.some(function (a) {
      return isActive(a) && a.type === type && a.itemId === itemId &&
             a.direction === direction && a.target === target;
    });
    if (duplicate) return { error: 'Bu alarm zaten kurulu.' };

    var alarm = {
      id: newId(), type: type, itemId: itemId, title: title,
      direction: direction, target: target,
      createdAt: Date.now(), triggeredAt: null, triggeredPrice: null
    };
    items.push(alarm);
    save();
    return { alarm: alarm };
  }

  function remove(id) {
    items = items.filter(function (a) { return a.id !== id; });
    save();
  }

  function clearTriggered() {
    items = items.filter(isActive);
    save();
  }

  // Aktif olanlar önce (yeni kurulan üstte), sonra tetiklenenler (yeni tetiklenen üstte)
  function list() {
    return items.slice().sort(function (a, b) {
      if (isActive(a) !== isActive(b)) return isActive(a) ? -1 : 1;
      return isActive(a) ? b.createdAt - a.createdAt : b.triggeredAt - a.triggeredAt;
    });
  }

  function forItem(type, itemId) {
    return list().filter(function (a) { return a.type === type && a.itemId === itemId; });
  }

  function active() {
    return items.filter(isActive);
  }

  function activeCount(type, itemId) {
    return active().filter(function (a) { return a.type === type && a.itemId === itemId; }).length;
  }

  // Aktif alarmların ilgilendiği pariteler; app.js bu fiyatları çekmeyi unutmasın diye
  function activeIds(type) {
    var seen = {};
    active().forEach(function (a) { if (a.type === type) seen[a.itemId] = true; });
    return Object.keys(seen);
  }

  /* Her veri yenilemesinden sonra çağrılır. lookup(type, itemId) -> güncel fiyat ya da null.
     Koşulu sağlayan aktif alarmları tetiklenmiş işaretler ve döndürür (bir alarm bir kez). */
  function evaluate(lookup) {
    var fired = [];
    items.forEach(function (a) {
      if (!isActive(a)) return;
      var price = lookup(a.type, a.itemId);
      if (price === null || price === undefined || isNaN(price)) return;

      var hit = a.direction === 'above' ? price >= a.target : price <= a.target;
      if (hit) {
        a.triggeredAt = Date.now();
        a.triggeredPrice = price;
        fired.push(a);
      }
    });
    if (fired.length) save();
    return fired;
  }

  // Sunucu senkronu: tüm liste (kopya). Sunucu alarmın VARLIĞI için istemciye güveniyor.
  function exportAll() {
    return items.map(function (a) { return Object.assign({}, a); });
  }

  /* Sunucu bir alarmı sen yokken tetiklemişse yerel kayda yansıtır. Yerel listeyi sunucudan gelen
     listeyle toptan DEĞİŞTİRMİYORUZ: istek yoldayken eklenen/silinen alarm kaybolurdu (ya da
     geri gelirdi). Yalnızca zaten var olan alarmların "tetiklendi" bilgisi alınır.
     Dönen: bu çağrıyla yeni tetiklenmiş görünen yerel alarmlar. */
  function applyTriggered(serverAlarms) {
    var changed = [];
    (serverAlarms || []).forEach(function (s) {
      items.forEach(function (a) {
        if (a.id === s.id && !a.triggeredAt && s.triggeredAt) {
          a.triggeredAt = s.triggeredAt;
          a.triggeredPrice = s.triggeredPrice;
          changed.push(a);
        }
      });
    });
    if (changed.length) save();
    return changed;
  }

  function isWritable() {
    return writable;
  }

  return {
    load: load,
    add: add,
    remove: remove,
    clearTriggered: clearTriggered,
    list: list,
    forItem: forItem,
    active: active,
    activeCount: activeCount,
    activeIds: activeIds,
    evaluate: evaluate,
    exportAll: exportAll,
    applyTriggered: applyTriggered,
    directionFor: directionFor,
    parsePrice: parsePrice,
    isWritable: isWritable
  };
})();
