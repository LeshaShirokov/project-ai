/* Хранилище контактов: localStorage, валидация, демо-данные, импорт/экспорт */
(function (global) {
  'use strict';
  var PD = global.PD = global.PD || {};
  var U = PD.utils;

  var STORAGE_KEY = 'itpd.contacts.v1';
  var INIT_KEY = 'itpd.contacts.initialized';
  var PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
  var PHOTO_MAX = 400000; // символов data URL (~290 КБ)
  var EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:".]{2,}$/;
  var PHONE_CHARS_RE = /^[+\d\s()\-.]+$/;

  function str(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 200); }
  function oneLine(v, max) { return str(v, max).replace(/\s+/g, ' '); }

  /* ---------- Телефон и почта ---------- */
  function phoneDigits(v) { return String(v || '').replace(/\D/g, ''); }
  function isValidPhone(v) {
    v = String(v || '').trim();
    if (!v) return true;
    if (!PHONE_CHARS_RE.test(v) || v.indexOf('+') > 0) return false;
    var n = phoneDigits(v).length;
    return n >= 5 && n <= 15;
  }
  /** Нормализация: российские номера → +7 (XXX) XXX-XX-XX, прочие — «+цифры» или как есть без лишних пробелов. */
  function normalizePhone(v) {
    v = String(v || '').trim().replace(/\s+/g, ' ');
    if (!v || !isValidPhone(v)) return str(v, 40);
    var d = phoneDigits(v);
    if (d.length === 11 && (d[0] === '7' || d[0] === '8') && (v[0] === '+' ? d[0] === '7' : true)) d = d.slice(1);
    else if (!(d.length === 10 && d[0] === '9' && v[0] !== '+')) return v;
    return '+7 (' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6, 8) + '-' + d.slice(8, 10);
  }
  /** Значение для href="tel:…" — только цифры и ведущий «+». */
  function telHref(v) {
    var d = phoneDigits(v);
    return d ? 'tel:' + (String(v).trim()[0] === '+' ? '+' : '') + d : '';
  }
  function isValidEmail(v) { v = String(v || '').trim(); return !v || (v.length <= 254 && EMAIL_RE.test(v)); }
  function isValidPhoto(v) { return typeof v === 'string' && v.length <= PHOTO_MAX && PHOTO_RE.test(v); }

  function normalize(c) {
    c = c || {};
    var email = str(c.email, 254);
    var phone = normalizePhone(c.phone);
    return {
      id: str(c.id, 60) || U.uid('c'),
      name: oneLine(c.name, 120) || 'Без имени',
      phone: isValidPhone(phone) ? phone : '',
      org: oneLine(c.org, 120),
      email: isValidEmail(email) ? email.toLowerCase() : '',
      comment: str(c.comment, 2000),
      isTeam: !!c.isTeam,
      photo: isValidPhoto(c.photo) ? c.photo : '',
      createdAt: str(c.createdAt, 40) || new Date().toISOString(),
      updatedAt: str(c.updatedAt, 40) || new Date().toISOString()
    };
  }

  function validate(d) {
    var e = {};
    var name = String(d.name == null ? '' : d.name).trim();
    if (!name) e.name = 'Укажите ФИО';
    else if (name.length > 120) e.name = 'Не длиннее 120 символов';
    if (!isValidPhone(d.phone)) e.phone = 'Некорректный номер: только цифры, пробелы, + ( ) -, от 5 до 15 цифр';
    if (!isValidEmail(d.email)) e.email = 'Некорректный адрес почты';
    if (d.org && String(d.org).trim().length > 120) e.org = 'Не длиннее 120 символов';
    if (d.comment && String(d.comment).length > 2000) e.comment = 'Не длиннее 2000 символов';
    if (d.photo && !isValidPhoto(d.photo)) e.photo = 'Некорректное изображение';
    return e;
  }

  /* ---------- Демо-данные (вымышленные люди; стабильные ID, чтобы повторная загрузка не ломала команды) ---------- */
  function demoContacts() {
    var raw = [
      ['demo_c1', 'Анна Петрова', 'Внутренний ИТ', '+7 900 000-00-01', 'anna.petrova@example.com', 'Демо-контакт. Тимлид фронтенда.', true],
      ['demo_c2', 'Игорь Смирнов', 'Внутренний ИТ', '+7 900 000-00-02', 'igor.smirnov@example.com', 'Демо-контакт. Бэкенд, интеграции.', true],
      ['demo_c3', 'Олег Ким', 'Внутренний ИТ', '+7 900 000-00-03', 'oleg.kim@example.com', 'Демо-контакт. Аналитик.', true],
      ['demo_c4', 'Мария Иванова', 'Внутренний ИТ', '+7 900 000-00-04', 'maria.ivanova@example.com', 'Демо-контакт. Мобильная разработка.', true],
      ['demo_c5', 'Сергей Волков', 'Внутренний ИТ', '+7 900 000-00-05', 'sergey.volkov@example.com', 'Демо-контакт. DevOps.', true],
      ['demo_c6', 'Павел Зайцев', 'Внутренний ИТ', '+7 900 000-00-06', 'pavel.zaytsev@example.com', 'Демо-контакт. SRE, дежурства.', true],
      ['demo_c7', 'Виктор Демидов', 'ООО «ТехноСервис»', '+7 900 000-00-07', 'v.demidov@example.org', 'Демо-контакт. Заказчик CRM со стороны клиента.', false],
      ['demo_c8', 'Ксения Белова', 'Банк «Северный»', '+7 900 000-00-08', 'k.belova@example.org', 'Демо-контакт. Владелец продукта.', false]
    ];
    return raw.map(function (r) { return normalize({ id: r[0], name: r[1], org: r[2], phone: r[3], email: r[4], comment: r[5], isTeam: r[6] }); });
  }

  /* ---------- Состояние ---------- */
  var contacts = [];
  var listeners = [];
  var storageOk = true;

  function emit(reason) { listeners.forEach(function (fn) { try { fn(reason); } catch (e) { console.error(e); } }); }
  function subscribe(fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; }

  function readStorage() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (raw === null) return null;
      var data = JSON.parse(raw);
      var list = Array.isArray(data) ? data : (data && Array.isArray(data.contacts) ? data.contacts : []);
      return list.filter(function (x) { return x && typeof x === 'object'; }).map(normalize);
    } catch (e) { console.warn('Не удалось прочитать контакты', e); return []; }
  }

  function save() {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, contacts: contacts }));
      global.localStorage.setItem(INIT_KEY, '1');
      storageOk = true;
    } catch (e) { storageOk = false; console.warn('Не удалось сохранить контакты', e); }
    return storageOk;
  }
  /** Сохранение с откатом, если localStorage переполнен (например, из-за фото). */
  function commit(prev, reason) {
    if (save()) { emit(reason); return; }
    contacts = prev;
    var err = new Error('Не удалось сохранить: недостаточно места в localStorage (попробуйте фото меньшего размера)');
    err.quota = true;
    throw err;
  }

  function load() {
    var stored = readStorage();
    var initialized = false;
    try { initialized = global.localStorage.getItem(INIT_KEY) === '1'; } catch (e) { /* noop */ }
    if (stored === null && !initialized) { contacts = demoContacts(); save(); }
    else contacts = stored || [];
    emit('load');
    return contacts;
  }
  function reload() { contacts = readStorage() || []; emit('sync'); }

  function all() { return contacts.slice(); }
  function team() { return contacts.filter(function (c) { return c.isTeam; }); }
  function get(id) { for (var i = 0; i < contacts.length; i++) if (contacts[i].id === id) return contacts[i]; return null; }
  function indexOf(id) { for (var i = 0; i < contacts.length; i++) if (contacts[i].id === id) return i; return -1; }

  function fail(errors) { var err = new Error('validation'); err.errors = errors; throw err; }

  function create(data) {
    var errors = validate(data);
    if (Object.keys(errors).length) fail(errors);
    var now = new Date().toISOString();
    var c = normalize(Object.assign({}, data, { id: U.uid('c'), createdAt: now, updatedAt: now }));
    var prev = contacts.slice();
    contacts.push(c); commit(prev, 'create');
    return c;
  }
  function update(id, data) {
    var i = indexOf(id);
    if (i < 0) return null;
    var merged = Object.assign({}, contacts[i], data, { id: id, createdAt: contacts[i].createdAt, updatedAt: new Date().toISOString() });
    var errors = validate(merged);
    if (Object.keys(errors).length) fail(errors);
    var prev = contacts.slice();
    contacts[i] = normalize(merged); commit(prev, 'update');
    return contacts[i];
  }
  function remove(id) {
    var i = indexOf(id);
    if (i < 0) return false;
    var prev = contacts.slice();
    contacts.splice(i, 1); commit(prev, 'remove');
    return true;
  }
  function loadDemo() { var prev = contacts; contacts = demoContacts(); commit(prev, 'demo'); }
  function clearAll() { var prev = contacts; contacts = []; commit(prev, 'clear'); }

  /* ---------- Импорт / экспорт ---------- */
  function exportJSON() {
    return JSON.stringify({ app: 'it-projects-dashboard', kind: 'contacts', version: 1, exportedAt: new Date().toISOString(), contacts: contacts }, null, 2);
  }
  /** Достаёт список контактов из файла: массив, {contacts: [...]} или полная резервная копия. */
  function parseList(text) {
    var data;
    try { data = typeof text === 'string' ? JSON.parse(text) : text; } catch (e) { throw new Error('Файл не является корректным JSON'); }
    var list = Array.isArray(data) ? data : (data && Array.isArray(data.contacts) ? data.contacts : null);
    if (!list) throw new Error('В файле не найден список контактов');
    return list.filter(function (x) { return x && typeof x === 'object'; }).slice(0, 5000);
  }
  function importJSON(text, mode) {
    var items = parseList(text).map(normalize);
    var prev = contacts.slice();
    if (mode === 'merge') {
      items.forEach(function (c) { var i = indexOf(c.id); if (i >= 0) contacts[i] = c; else contacts.push(c); });
    } else contacts = items;
    commit(prev, 'import');
    return items.length;
  }
  /** CSV без фото; projectsOf(c) — названия проектов контакта. */
  function exportCSV(projectsOf) {
    var header = ['ФИО', 'Телефон', 'Организация', 'Почта', 'Комментарии', 'Команда работников', 'Проекты'];
    var rows = contacts.map(function (c) {
      return [c.name, c.phone, c.org, c.email, c.comment, c.isTeam ? 'да' : 'нет', projectsOf ? projectsOf(c).join(', ') : ''];
    });
    return '\uFEFF' + U.toCSV([header].concat(rows));
  }

  PD.contacts = {
    STORAGE_KEY: STORAGE_KEY, INIT_KEY: INIT_KEY,
    normalize: normalize, validate: validate, normalizePhone: normalizePhone, isValidPhone: isValidPhone, isValidEmail: isValidEmail,
    isValidPhoto: isValidPhoto, telHref: telHref, demoContacts: demoContacts,
    load: load, reload: reload, save: save, subscribe: subscribe, all: all, team: team, get: get,
    create: create, update: update, remove: remove, loadDemo: loadDemo, clearAll: clearAll,
    exportJSON: exportJSON, parseList: parseList, importJSON: importJSON, exportCSV: exportCSV,
    storageOk: function () { return storageOk; }
  };
})(window);
