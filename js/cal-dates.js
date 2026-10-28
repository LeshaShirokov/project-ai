/* Календарная арифметика: даты в формате YYYY-MM-DD (локальное время), неделя с понедельника */
(function (global) {
  'use strict';
  var PD = global.PD = global.PD || {};
  var U = PD.utils;

  var VIEWS = ['day', 'week', 'month'];
  var MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  var MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var WEEKDAYS = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
  var WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  function parts(iso) {
    var d = U.parseDate(iso);
    return d ? { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() } : null;
  }
  /** Дата из компонент (переполнение дня/месяца нормализуется движком Date; час 12 — без сдвигов из-за перехода на летнее время). */
  function make(y, m, d) { return U.toISODate(new Date(y, m, d, 12)); }
  function todayISO() { return U.toISODate(U.today()); }

  function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
  function daysInMonth(y, m) { return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][((m % 12) + 12) % 12]; }

  function addDays(iso, n) { var p = parts(iso); return p ? make(p.y, p.m, p.d + n) : null; }
  /** Сдвиг на n месяцев; 31 января + 1 месяц = 28/29 февраля (день прижимается к концу месяца). */
  function addMonths(iso, n) {
    var p = parts(iso);
    if (!p) return null;
    var total = p.y * 12 + p.m + n, y = Math.floor(total / 12), m = total - y * 12;
    return make(y, m, Math.min(p.d, daysInMonth(y, m)));
  }
  /** День недели: 0 — понедельник … 6 — воскресенье. */
  function weekday(iso) { var d = U.parseDate(iso); return d ? (d.getDay() + 6) % 7 : null; }
  function startOfWeek(iso) { var w = weekday(iso); return w === null ? null : addDays(iso, -w); }
  function endOfWeek(iso) { var s = startOfWeek(iso); return s && addDays(s, 6); }
  function startOfMonth(iso) { var p = parts(iso); return p ? make(p.y, p.m, 1) : null; }
  function endOfMonth(iso) { var p = parts(iso); return p ? make(p.y, p.m, daysInMonth(p.y, p.m)) : null; }
  function sameMonth(a, b) { return !!a && !!b && a.slice(0, 7) === b.slice(0, 7); }
  /** Разница в днях b − a. */
  function diffDays(a, b) {
    var da = U.parseDate(a), db = U.parseDate(b);
    if (!da || !db) return null;
    return Math.round((Date.UTC(db.getFullYear(), db.getMonth(), db.getDate()) - Date.UTC(da.getFullYear(), da.getMonth(), da.getDate())) / 86400000);
  }
  /** Все даты от from до to включительно. */
  function eachDay(from, to) {
    var out = [], n = diffDays(from, to);
    for (var i = 0; n !== null && i <= n; i++) out.push(addDays(from, i));
    return out;
  }
  /** Сетка месяца: недели (массивы по 7 дат) с понедельника, включая дни соседних месяцев. */
  function monthGrid(iso) {
    var days = eachDay(startOfWeek(startOfMonth(iso)), endOfWeek(endOfMonth(iso)));
    var weeks = [];
    for (var i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
    return weeks;
  }
  /** Видимый диапазон для вида. */
  function range(view, iso) {
    if (view === 'day') return { from: iso, to: iso };
    if (view === 'week') return { from: startOfWeek(iso), to: endOfWeek(iso) };
    var g = monthGrid(iso);
    return { from: g[0][0], to: g[g.length - 1][6] };
  }
  /** Шаг «назад/вперёд» для вида. */
  function shift(view, iso, dir) {
    if (view === 'day') return addDays(iso, dir);
    if (view === 'week') return addDays(iso, 7 * dir);
    return addMonths(iso, dir);
  }

  function dayMonth(p) { return p.d + ' ' + MONTHS_GEN[p.m]; }
  /** Заголовок диапазона: «Октябрь 2026», «26 октября – 1 ноября 2026», «среда, 28 октября 2026». */
  function title(view, iso) {
    var p = parts(iso);
    if (!p) return '';
    if (view === 'month') return MONTHS[p.m] + ' ' + p.y;
    if (view === 'day') return WEEKDAYS[weekday(iso)] + ', ' + dayMonth(p) + ' ' + p.y;
    var a = parts(startOfWeek(iso)), b = parts(endOfWeek(iso));
    if (a.y !== b.y) return dayMonth(a) + ' ' + a.y + ' – ' + dayMonth(b) + ' ' + b.y;
    if (a.m !== b.m) return dayMonth(a) + ' – ' + dayMonth(b) + ' ' + b.y;
    return a.d + '–' + b.d + ' ' + MONTHS_GEN[b.m] + ' ' + b.y;
  }
  /** Полная подпись дня для скринридеров: «среда, 28 октября 2026». */
  function longLabel(iso) { return title('day', iso); }
  function shortLabel(iso) { var p = parts(iso); return p ? dayMonth(p) : ''; }

  /** Разбор/сборка hash: #view=week&date=2026-10-28 */
  function parseHash(hash) {
    var out = {};
    String(hash || '').replace(/^#/, '').split('&').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i < 0) return;
      var k = kv.slice(0, i), v;
      try { v = decodeURIComponent(kv.slice(i + 1)); } catch (e) { return; }
      if (k === 'view' && VIEWS.indexOf(v) >= 0) out.view = v;
      if (k === 'date' && U.isValidDate(v)) out.date = v;
    });
    return out;
  }
  function buildHash(view, iso) { return '#view=' + view + '&date=' + iso; }

  PD.calDates = {
    VIEWS: VIEWS, MONTHS: MONTHS, MONTHS_GEN: MONTHS_GEN, WEEKDAYS: WEEKDAYS, WEEKDAYS_SHORT: WEEKDAYS_SHORT,
    todayISO: todayISO, isLeap: isLeap, daysInMonth: daysInMonth, addDays: addDays, addMonths: addMonths,
    weekday: weekday, startOfWeek: startOfWeek, endOfWeek: endOfWeek, startOfMonth: startOfMonth, endOfMonth: endOfMonth,
    sameMonth: sameMonth, diffDays: diffDays, eachDay: eachDay, monthGrid: monthGrid, range: range, shift: shift,
    title: title, longLabel: longLabel, shortLabel: shortLabel, parseHash: parseHash, buildHash: buildHash
  };
})(window);
