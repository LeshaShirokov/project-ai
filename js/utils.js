/* Утилиты: безопасное построение DOM, форматирование, даты, CSV */
(function (global) {
  'use strict';
  var PD = global.PD = global.PD || {};

  /**
   * Создание DOM-элемента без innerHTML.
   * h('div', {class: 'x', onclick: fn, 'aria-label': '...'}, ['текст', childNode])
   * Строки всегда вставляются как текстовые узлы — пользовательские данные экранируются автоматически.
   */
  function h(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var val = attrs[key];
        if (val === undefined || val === null || val === false) return;
        if (key === 'class') node.className = val;
        else if (key === 'text') node.textContent = String(val);
        else if (key === 'dataset') Object.keys(val).forEach(function (k) { node.dataset[k] = val[k]; });
        else if (key.slice(0, 2) === 'on' && typeof val === 'function') node.addEventListener(key.slice(2), val);
        else if (key === 'value') node.value = val;
        else if (key === 'checked' || key === 'selected' || key === 'disabled') node[key] = !!val;
        else node.setAttribute(key, val === true ? '' : String(val));
      });
    }
    append(node, children);
    return node;
  }

  function append(node, children) {
    if (children === undefined || children === null || children === false) return node;
    if (!Array.isArray(children)) children = [children];
    children.forEach(function (c) {
      if (c === undefined || c === null || c === false) return;
      if (Array.isArray(c)) append(node, c);
      else if (typeof c === 'string' || typeof c === 'number') node.appendChild(document.createTextNode(String(c)));
      else node.appendChild(c);
    });
    return node;
  }

  var SVG_NS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs, children) {
    var node = document.createElementNS(SVG_NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (attrs[k] === undefined || attrs[k] === null) return;
      if (k === 'text') node.textContent = String(attrs[k]);
      else node.setAttribute(k, String(attrs[k]));
    });
    if (children) (Array.isArray(children) ? children : [children]).forEach(function (c) {
      if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

  /** HTML-экранирование (на случай генерации строк — в интерфейсе не используется вместе с innerHTML). */
  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  var moneyFmt = null;
  function money(n) {
    n = Number(n) || 0;
    try {
      if (!moneyFmt) moneyFmt = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
      return moneyFmt.format(n);
    } catch (e) { return Math.round(n) + ' ₽'; }
  }
  function moneyShort(n) {
    n = Number(n) || 0;
    var abs = Math.abs(n);
    if (abs >= 1e9) return (n / 1e9).toFixed(1).replace('.0', '').replace('.', ',') + ' млрд ₽';
    if (abs >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '').replace('.', ',') + ' млн ₽';
    if (abs >= 1e3) return Math.round(n / 1e3) + ' тыс ₽';
    return Math.round(n) + ' ₽';
  }

  /* ---------- Даты (формат YYYY-MM-DD, локальное время) ---------- */
  var DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  function parseDate(str) {
    var m = DATE_RE.exec(String(str || ''));
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    if (d.getFullYear() !== +m[1] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3]) return null;
    return d;
  }
  function isValidDate(str) { return parseDate(str) !== null; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function toISODate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(days) { var d = today(); d.setDate(d.getDate() + days); return toISODate(d); }
  /** Сколько дней осталось до даты (отрицательное — просрочено). */
  function daysUntil(str) {
    var d = parseDate(str);
    if (!d) return null;
    return Math.round((d.getTime() - today().getTime()) / 86400000);
  }
  function formatDate(str) {
    var d = parseDate(str);
    if (!d) return '—';
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear();
  }
  function plural(n, one, few, many) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }
  function daysLabel(n) {
    if (n === null) return 'без срока';
    if (n === 0) return 'сегодня';
    if (n < 0) return 'просрочен на ' + (-n) + ' ' + plural(-n, 'день', 'дня', 'дней');
    return 'осталось ' + n + ' ' + plural(n, 'день', 'дня', 'дней');
  }

  /* ---------- URL ---------- */
  function isHttpUrl(str) {
    if (!str) return false;
    try {
      var u = new URL(String(str));
      return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.hostname;
    } catch (e) { return false; }
  }

  /* ---------- Списки ---------- */
  function splitList(str) {
    if (Array.isArray(str)) str = str.join(',');
    var seen = {};
    return String(str || '').split(/[,;\n]/).map(function (x) { return x.trim().slice(0, 60); })
      .filter(function (x) {
        if (!x) return false;
        var k = x.toLowerCase();
        if (seen[k]) return false;
        seen[k] = true; return true;
      }).slice(0, 30);
  }

  /* ---------- CSV (разделитель ';', защита от формул) ---------- */
  function csvCell(value) {
    var str = value == null ? '' : String(value);
    if (typeof value !== 'number' && /^[=+\-@\t\r]/.test(str)) str = "'" + str;
    return '"' + str.replace(/"/g, '""') + '"';
  }
  function toCSV(rows) {
    return rows.map(function (r) { return r.map(csvCell).join(';'); }).join('\r\n');
  }

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = h('a', { href: url, download: filename, style: 'display:none' });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 0);
  }

  PD.utils = {
    h: h, s: s, append: append, clear: clear, escapeHtml: escapeHtml,
    money: money, moneyShort: moneyShort,
    parseDate: parseDate, isValidDate: isValidDate, toISODate: toISODate, today: today, addDays: addDays,
    daysUntil: daysUntil, formatDate: formatDate, daysLabel: daysLabel, plural: plural,
    isHttpUrl: isHttpUrl, splitList: splitList, csvCell: csvCell, toCSV: toCSV, uid: uid, download: download
  };
})(window);
