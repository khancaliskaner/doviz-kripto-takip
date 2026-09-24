/* Favorilerin localStorage'da saklanması.
   Anahtar biçimi: "fx:USD" veya "crypto:bitcoin". Ekleme sırası korunuyor. */
var Favorites = (function () {

  var items = [];
  var writable = true;

  function key(type, id) {
    return type + ':' + id;
  }

  function parse(k) {
    var i = k.indexOf(':');
    return { type: k.slice(0, i), id: k.slice(i + 1) };
  }

  /* localStorage gizli sekmede veya kısıtlı ayarlarda hata fırlatabiliyor;
     bu durumda uygulama çalışmaya devam etsin, sadece kalıcılık kaybolsun. */
  function load() {
    try {
      var raw = localStorage.getItem(CONFIG.storageKey);
      var parsed = raw ? JSON.parse(raw) : [];
      items = Array.isArray(parsed) ? parsed.filter(function (k) {
        return typeof k === 'string' && k.indexOf(':') > 0;
      }) : [];
    } catch (e) {
      items = [];
      writable = false;
    }
    return items;
  }

  function save() {
    try {
      localStorage.setItem(CONFIG.storageKey, JSON.stringify(items));
      writable = true;
    } catch (e) {
      writable = false;
    }
    return writable;
  }

  function has(type, id) {
    return items.indexOf(key(type, id)) !== -1;
  }

  function add(type, id) {
    if (!has(type, id)) {
      items.push(key(type, id));
      save();
    }
  }

  function remove(type, id) {
    var i = items.indexOf(key(type, id));
    if (i !== -1) {
      items.splice(i, 1);
      save();
    }
  }

  // Dönen: eklendiyse true, çıkarıldıysa false
  function toggle(type, id) {
    if (has(type, id)) {
      remove(type, id);
      return false;
    }
    add(type, id);
    return true;
  }

  function indexOf(type, id) {
    return items.indexOf(key(type, id));
  }

  /* Bir favoriyi baska bir favorinin bulundugu siraya tasir. toIndex, hedefin TASIMADAN ONCEKI
     sirasidir: [A,B,C] icinde A yi C nin uzerine birakirsan [B,C,A], C yi A nin uzerine
     birakirsan [C,A,B] olur. Dönen: sira degistiyse true. */
  function moveTo(type, id, toIndex) {
    var from = indexOf(type, id);
    if (from === -1 || from === toIndex) return false;

    var k = items.splice(from, 1)[0];
    var to = Math.max(0, Math.min(items.length, toIndex));
    items.splice(to, 0, k);
    save();
    return true;
  }

  function list() {
    return items.map(parse);
  }

  function listOf(type) {
    return list().filter(function (f) { return f.type === type; })
                 .map(function (f) { return f.id; });
  }

  function count() {
    return items.length;
  }

  function isWritable() {
    return writable;
  }

  return {
    load: load,
    has: has,
    add: add,
    remove: remove,
    toggle: toggle,
    list: list,
    indexOf: indexOf,
    moveTo: moveTo,
    listOf: listOf,
    count: count,
    isWritable: isWritable
  };
})();
