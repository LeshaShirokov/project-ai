/* Связь проектов и контактов: участники команды, миграция старых имён, удаление/снятие отметки */
(function (global) {
  'use strict';
  var PD = global.PD = global.PD || {};
  var U = PD.utils, S = PD.store, C = PD.contacts, UI = PD.ui;
  var h = U.h;

  function nameKey(name) { return String(name || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim(); }
  function contactHref(id) { return 'contacts.html#contact=' + encodeURIComponent(id); }

  /** Участники проекта: контакты по teamIds (удалённые — как «неизвестный контакт»), затем имена без контакта. */
  function members(p) {
    var list = (p.teamIds || []).map(function (id) {
      var c = C.get(id);
      return c ? { id: id, name: c.name, photo: c.photo, org: c.org, contact: c } : { id: id, name: 'Неизвестный контакт', missing: true };
    });
    (p.team || []).forEach(function (n) { list.push({ name: n, legacy: true }); });
    return list;
  }
  function names(p) { return members(p).filter(function (m) { return !m.missing; }).map(function (m) { return m.name; }); }

  /** Проекты, в команде которых есть хотя бы один из контактов ids. */
  function projectsWith(ids) {
    if (!Array.isArray(ids)) ids = [ids];
    return S.all().filter(function (p) { return p.teamIds.some(function (x) { return ids.indexOf(x) >= 0; }); });
  }

  /** Убрать контакты из команд всех проектов. Возвращает число изменённых проектов. */
  function detach(ids) {
    if (!Array.isArray(ids)) ids = [ids];
    if (!ids.length) return 0;
    return S.mapTeams(function (p) {
      if (!p.teamIds.some(function (x) { return ids.indexOf(x) >= 0; })) return null;
      return { teamIds: p.teamIds.filter(function (x) { return ids.indexOf(x) < 0; }) };
    });
  }
  /** ID из команд, которых нет среди контактов. */
  function missingIds() {
    var seen = {};
    S.all().forEach(function (p) { p.teamIds.forEach(function (id) { if (!C.get(id)) seen[id] = true; }); });
    return Object.keys(seen);
  }
  function pruneMissing() { return detach(missingIds()); }

  /**
   * Сопоставление старых текстовых имён с контактами «Команда работников» (без учёта регистра/ё/пробелов).
   * Неоднозначные (несколько контактов с одним ФИО) и ненайденные имена остаются текстом — данные не теряются.
   */
  function matchLegacy(list) {
    var index = {};
    C.team().forEach(function (c) { var k = nameKey(c.name); index[k] = index[k] ? 'ambiguous' : c.id; });
    var ids = [], rest = [];
    (list || []).forEach(function (n) {
      var id = index[nameKey(n)];
      if (id && id !== 'ambiguous') { if (ids.indexOf(id) < 0) ids.push(id); }
      else rest.push(n);
    });
    return { ids: ids, rest: rest };
  }
  /** Миграция: имена в p.team, совпавшие с контактами команды, переносятся в p.teamIds. */
  function migrate() {
    return S.mapTeams(function (p) {
      if (!p.team.length) return null;
      var m = matchLegacy(p.team);
      if (!m.ids.length) return null;
      return { team: m.rest, teamIds: p.teamIds.concat(m.ids.filter(function (id) { return p.teamIds.indexOf(id) < 0; })) };
    });
  }

  /* ---------- Отрисовка ---------- */
  /** Компактная группа аватаров (до max), полный список — в подсказке и для скринридеров. */
  function avatars(p, max) {
    max = max || 3;
    var list = members(p);
    if (!list.length) return h('span', { class: 'muted' }, '—');
    var label = list.map(function (m) { return m.name; }).join(', ');
    return h('span', { class: 'avatars', title: label }, [
      h('span', { class: 'sr-only' }, 'Команда: ' + label),
      list.slice(0, max).map(function (m) { return UI.avatar(m); }),
      list.length > max ? h('span', { class: 'avatar avatar-more', 'aria-hidden': 'true' }, '+' + (list.length - max)) : null
    ]);
  }
  /** Список участников с аватарами; контакты — ссылками на страницу «Контакты». */
  function memberList(p) {
    var list = members(p);
    if (!list.length) return h('span', { class: 'muted' }, '—');
    return h('ul', { class: 'member-list' }, list.map(function (m) {
      var label = m.contact
        ? h('a', { href: contactHref(m.id), class: 'link-btn member-name', title: 'Открыть контакт' }, m.name)
        : h('span', { class: 'member-name' + (m.missing ? ' muted' : '') }, m.name);
      return h('li', { class: 'member' }, [
        UI.avatar(m),
        label,
        m.legacy ? h('small', { class: 'muted', title: 'Имя указано текстом, без карточки в контактах' }, 'не из контактов') : null
      ]);
    }));
  }

  PD.team = {
    nameKey: nameKey, contactHref: contactHref, members: members, names: names, projectsWith: projectsWith,
    detach: detach, missingIds: missingIds, pruneMissing: pruneMissing, matchLegacy: matchLegacy, migrate: migrate,
    avatars: avatars, memberList: memberList
  };
})(window);
