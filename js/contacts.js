/* Страница «Контакты»: карточки и таблица, фильтры, форма с фото, карточка контакта с проектами */
(function (global) {
  'use strict';
  var PD = global.PD = global.PD || {};
  var U = PD.utils, S = PD.store, C = PD.contacts, T = PD.team, UI = PD.ui, SH = PD.shell, PH = PD.photo;
  var h = U.h;

  var VIEW_KEY = 'itpd.contactsView';

  var state = {
    filters: { q: '', type: '', org: '' },
    sort: 'name:asc',
    view: 'cards',
    editingId: null,
    detailsId: null,
    photo: '',        // фото в форме (data URL) — сохраняется только по кнопке «Сохранить»
    photoBusy: null   // Promise обработки выбранного файла
  };

  function $(id) { return document.getElementById(id); }

  /* ---------- Фильтрация и сортировка ---------- */
  function orgKey(s) { return String(s || '').toLowerCase().trim(); }
  function filtered() {
    var f = state.filters, q = f.q.trim().toLowerCase(), qDigits = q.replace(/\D/g, '');
    var list = C.all().filter(function (c) {
      if (f.type === 'team' && !c.isTeam) return false;
      if (f.type === 'external' && c.isTeam) return false;
      if (f.org && orgKey(c.org) !== orgKey(f.org)) return false;
      if (q) {
        var hay = [c.name, c.org, c.email, c.phone, c.comment].join(' ').toLowerCase();
        var byDigits = qDigits.length >= 3 && qDigits.length === q.replace(/[\s()+\-.]/g, '').length && c.phone.replace(/\D/g, '').indexOf(qDigits) >= 0;
        if (hay.indexOf(q) === -1 && !byDigits) return false;
      }
      return true;
    });
    var parts = state.sort.split(':'), key = parts[0], dir = parts[1] === 'desc' ? -1 : 1;
    list.sort(function (a, b) {
      if (key === 'org') {
        if (!a.org !== !b.org) return a.org ? -1 : 1; // без организации — в конце
        var r = a.org.localeCompare(b.org, 'ru') * dir;
        return r || a.name.localeCompare(b.name, 'ru');
      }
      return a.name.localeCompare(b.name, 'ru') * dir;
    });
    return list;
  }

  /* ---------- Мелкие элементы ---------- */
  function typeBadge(c) {
    return c.isTeam
      ? h('span', { class: 'badge badge-team', title: 'Можно выбрать в команду проекта' }, 'Команда')
      : h('span', { class: 'badge badge-muted' }, 'Внешний');
  }
  function phoneLink(c) {
    var href = C.telHref(c.phone);
    return href ? h('a', { href: href, class: 'contact-phone' }, c.phone) : h('span', { class: 'muted' }, c.phone || '—');
  }
  function emailLink(c) {
    return c.email && C.isValidEmail(c.email) ? h('a', { href: 'mailto:' + c.email, class: 'contact-email' }, c.email) : h('span', { class: 'muted' }, '—');
  }
  function projectCount(c) {
    var n = T.projectsWith(c.id).length;
    return n ? h('small', { class: 'muted' }, 'Проектов: ' + n) : null;
  }
  function actions(c) {
    return [
      h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Изменить «' + c.name + '»', title: 'Изменить', dataset: { act: 'edit' }, onclick: function (e) { openForm(c.id, e.currentTarget); } }, '✎'),
      h('button', { type: 'button', class: 'icon-btn sm danger', 'aria-label': 'Удалить «' + c.name + '»', title: 'Удалить', dataset: { act: 'delete' }, onclick: function () { deleteContact(c.id); } }, '🗑')
    ];
  }
  function nameButton(c, cls) {
    return h('button', { type: 'button', class: 'link-btn ' + (cls || ''), onclick: function () { openDetails(c.id); } }, c.name);
  }

  /* ---------- Отрисовка ---------- */
  function renderCards(root, list) {
    root.appendChild(h('ul', { class: 'contact-grid', 'aria-label': 'Список контактов' }, list.map(function (c) {
      return h('li', { class: 'card contact-card', dataset: { id: c.id } }, [
        h('div', { class: 'contact-card-top' }, [
          UI.avatar(c, { size: 'lg' }),
          h('div', { class: 'contact-card-title' }, [
            nameButton(c, 'contact-name'),
            c.org ? h('span', { class: 'muted contact-org' }, c.org) : null,
            typeBadge(c)
          ])
        ]),
        h('dl', { class: 'contact-lines' }, [
          h('div', null, [h('dt', null, 'Телефон'), h('dd', null, phoneLink(c))]),
          h('div', null, [h('dt', null, 'Почта'), h('dd', null, emailLink(c))])
        ]),
        c.comment ? h('p', { class: 'contact-comment' }, c.comment) : null,
        h('div', { class: 'contact-card-foot' }, [projectCount(c) || h('span'), h('span', { class: 'cell-actions' }, actions(c))])
      ]);
    })));
  }

  function renderTable(root, list) {
    var cols = ['ФИО', 'Организация', 'Телефон', 'Почта', 'Тип', 'Проекты', 'Действия'];
    root.appendChild(h('div', { class: 'table-wrap card' }, h('table', { class: 'table contacts-table' }, [
      h('caption', { class: 'sr-only' }, 'Список контактов'),
      h('thead', null, h('tr', null, cols.map(function (c) { return h('th', { scope: 'col' }, c); }))),
      h('tbody', null, list.map(function (c) {
        var n = T.projectsWith(c.id).length;
        return h('tr', { dataset: { id: c.id } }, [
          h('td', { 'data-label': 'ФИО', class: 'cell-name' }, h('span', { class: 'person' }, [UI.avatar(c, { size: 'md' }), nameButton(c, 'contact-name')])),
          h('td', { 'data-label': 'Организация' }, c.org || h('span', { class: 'muted' }, '—')),
          h('td', { 'data-label': 'Телефон', class: 'nowrap' }, phoneLink(c)),
          h('td', { 'data-label': 'Почта', class: 'cell-email' }, emailLink(c)),
          h('td', { 'data-label': 'Тип' }, typeBadge(c)),
          h('td', { 'data-label': 'Проекты' }, n ? String(n) : h('span', { class: 'muted' }, '—')),
          h('td', { 'data-label': 'Действия', class: 'cell-actions' }, actions(c))
        ]);
      }))
    ])));
  }

  function emptyState() {
    return h('div', { class: 'empty card' }, [
      h('p', { class: 'empty-title' }, 'Контакты не найдены'),
      h('p', { class: 'muted' }, C.all().length ? 'Измените поиск или фильтры.' : 'Добавьте первый контакт или загрузите демо-данные.'),
      h('div', { class: 'empty-actions' }, [
        h('button', { type: 'button', class: 'btn btn-primary', onclick: function (e) { openForm(null, e.currentTarget); } }, '＋ Новый контакт'),
        C.all().length ? h('button', { type: 'button', class: 'btn btn-ghost', onclick: resetFilters }, 'Сбросить фильтры') : null
      ])
    ]);
  }

  function fillOrgOptions() {
    var sel = $('cOrg'), current = state.filters.org, orgs = {};
    C.all().forEach(function (c) { if (c.org) orgs[orgKey(c.org)] = orgs[orgKey(c.org)] || c.org; });
    var names = Object.keys(orgs).map(function (k) { return orgs[k]; }).sort(function (a, b) { return a.localeCompare(b, 'ru'); });
    U.clear(sel).appendChild(h('option', { value: '' }, 'Все'));
    names.forEach(function (n) { sel.appendChild(h('option', { value: n, selected: orgKey(n) === orgKey(current) }, n)); });
    if (current && !orgs[orgKey(current)]) { state.filters.org = ''; sel.value = ''; }
    var dl = U.clear($('orgList'));
    names.forEach(function (n) { dl.appendChild(h('option', { value: n })); });
  }

  function render() {
    fillOrgOptions();
    var list = filtered(), total = C.all().length, root = U.clear($('contactsView'));
    $('contactsCount').textContent = list.length === total ? String(total) : list.length + ' из ' + total;
    if (!list.length) root.appendChild(emptyState());
    else if (state.view === 'table') renderTable(root, list);
    else renderCards(root, list);
    if (state.detailsId) {
      var c = C.get(state.detailsId);
      if (c) renderDetails(c); else UI.closeModal($('contactDetailsModal'));
    }
  }

  function setView(view) {
    state.view = view === 'table' ? 'table' : 'cards';
    SH.lsSet(VIEW_KEY, state.view);
    document.querySelectorAll('[data-view]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.view === state.view)); });
    render();
  }

  function resetFilters() {
    state.filters = { q: '', type: '', org: '' };
    $('cSearch').value = ''; $('cType').value = ''; $('cOrg').value = '';
    render();
  }

  /* ---------- Карточка контакта ---------- */
  function renderDetails(c) {
    $('contactDetailsTitle').textContent = c.name;
    var root = U.clear($('contactDetailsBody'));
    function meta(label, value) { return h('div', { class: 'meta-item' }, [h('dt', null, label), h('dd', null, value)]); }
    var projects = T.projectsWith(c.id);
    root.appendChild(h('div', { class: 'contact-hero' }, [
      UI.avatar(c, { size: 'xl' }),
      h('div', null, [h('p', { class: 'contact-hero-name' }, c.name), c.org ? h('p', { class: 'muted' }, c.org) : null, typeBadge(c)])
    ]));
    root.appendChild(h('dl', { class: 'meta-grid meta-grid-2' }, [
      meta('Телефон', phoneLink(c)),
      meta('Почта', emailLink(c)),
      meta('Организация', c.org || '—'),
      meta('Команда работников', c.isTeam ? 'да' : 'нет')
    ]));
    if (c.comment) root.appendChild(h('div', { class: 'contact-comment-block' }, [h('h3', null, 'Комментарии'), h('p', { class: 'details-desc' }, c.comment)]));
    root.appendChild(h('section', { class: 'contact-projects', 'aria-labelledby': 'contactProjectsTitle' }, [
      h('h3', { id: 'contactProjectsTitle' }, 'Участвует в проектах' + (projects.length ? ' (' + projects.length + ')' : '')),
      projects.length
        ? h('ul', { class: 'contact-project-list' }, projects.map(function (p) {
          return h('li', null, [h('a', { href: SH.projectHref(p.id), class: 'link-btn' }, p.name), UI.statusBadge(p.status)]);
        }))
        : h('p', { class: 'muted' }, c.isTeam ? 'Пока ни в одном проекте. Добавьте контакт в команду в форме проекта.' : 'Не участвует: в команду проекта можно выбрать только контакты с отметкой «Команда работников».')
    ]));
  }
  function openDetails(id) {
    var c = C.get(id);
    if (!c) return;
    state.detailsId = id;
    renderDetails(c);
    UI.openModal($('contactDetailsModal'), { onClose: function () { state.detailsId = null; } });
  }

  /* ---------- Удаление ---------- */
  function projectNames(list) {
    var names = list.slice(0, 5).map(function (p) { return '«' + p.name + '»'; }).join(', ');
    return names + (list.length > 5 ? ' и ещё ' + (list.length - 5) : '');
  }
  function deleteContact(id) {
    var c = C.get(id);
    if (!c) return Promise.resolve(false);
    var used = T.projectsWith(id);
    var msg = 'Удалить контакт «' + c.name + '»?';
    if (used.length) msg += ' Он участвует в ' + used.length + ' ' + U.plural(used.length, 'проекте', 'проектах', 'проектах') + ' (' + projectNames(used) + ') и будет убран из их команд.';
    msg += ' Это действие нельзя отменить.';
    return UI.confirm(msg, 'Удалить').then(function (ok) {
      if (!ok) return false;
      if (state.detailsId === id) UI.closeModal($('contactDetailsModal'));
      try { C.remove(id); } catch (e) { UI.toast(e.message, 'error'); return false; }
      var n = T.detach(id);
      UI.toast('Контакт удалён' + (n ? '; убран из команд проектов: ' + n : ''));
      return true;
    });
  }

  /* ---------- Форма ---------- */
  var form, fields;
  function initForm() {
    form = $('contactForm');
    fields = { name: $('cName'), phone: $('cPhone'), email: $('cEmail'), org: $('cOrgInput'), comment: $('cComment'), isTeam: $('cIsTeam') };
    form.addEventListener('submit', function (e) { e.preventDefault(); submitForm(); });
    Object.keys(fields).forEach(function (k) { fields[k].addEventListener('input', function () { setError(k, ''); }); });
    fields.phone.addEventListener('blur', function () {
      if (fields.phone.value.trim() && C.isValidPhone(fields.phone.value)) fields.phone.value = C.normalizePhone(fields.phone.value);
    });
    fields.name.addEventListener('input', updatePhotoPreview);
    $('cPhotoPick').addEventListener('click', function () { $('cPhotoFile').click(); });
    $('cPhotoFile').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (file) setPhotoFromFile(file);
    });
    $('cPhotoRemove').addEventListener('click', function () {
      state.photo = ''; setError('photo', ''); updatePhotoPreview(); $('cPhotoPick').focus();
    });
  }
  function setError(name, msg) {
    var el = $('err-' + name);
    if (el) el.textContent = msg || '';
    var f = fields[name];
    if (f) { if (msg) f.setAttribute('aria-invalid', 'true'); else f.removeAttribute('aria-invalid'); }
  }
  function updatePhotoPreview() {
    var box = U.clear($('cPhotoPreview'));
    box.appendChild(UI.avatar({ name: fields.name.value.trim() || '?', photo: state.photo }, { size: 'xl' }));
    $('cPhotoRemove').hidden = !state.photo;
    $('cPhotoPick').textContent = state.photo ? 'Заменить фото' : 'Загрузить фото';
  }
  /** Проверка и сжатие выбранного файла; результат попадает в форму (не в хранилище). */
  function setPhotoFromFile(file) {
    var err = PH.validateFile(file);
    if (err) { setError('photo', err); return Promise.resolve(false); }
    setError('photo', '');
    $('cPhotoPick').disabled = true;
    $('cPhotoPick').textContent = 'Обработка…';
    var p = state.photoBusy = Promise.resolve().then(function () { return PH.process(file); }).then(function (url) {
      if (!C.isValidPhoto(url)) throw new Error('Не удалось обработать изображение');
      state.photo = url; return true;
    }).catch(function (e) { setError('photo', e && e.message ? e.message : 'Не удалось обработать изображение'); return false; })
      .then(function (ok) {
        if (state.photoBusy === p) state.photoBusy = null;
        $('cPhotoPick').disabled = false;
        updatePhotoPreview();
        return ok;
      });
    return p;
  }

  function openForm(id, trigger) {
    var c = id ? C.get(id) : null;
    state.editingId = c ? c.id : null;
    $('contactModalTitle').textContent = c ? 'Редактирование контакта' : 'Новый контакт';
    form.reset();
    Object.keys(fields).concat('photo').forEach(function (k) { setError(k, ''); });
    var d = c || { isTeam: true };
    fields.name.value = d.name || '';
    fields.phone.value = d.phone || '';
    fields.email.value = d.email || '';
    fields.org.value = d.org || '';
    fields.comment.value = d.comment || '';
    fields.isTeam.checked = !!d.isTeam;
    state.photo = d.photo || '';
    state.photoBusy = null;
    $('cPhotoPick').disabled = false;
    updatePhotoPreview();
    UI.openModal($('contactModal'), { returnFocus: trigger || document.activeElement, initialFocus: fields.name, onClose: function () { state.editingId = null; } });
  }

  function readForm() {
    return {
      name: fields.name.value.trim(), phone: fields.phone.value.trim(), email: fields.email.value.trim(), org: fields.org.value.trim(),
      comment: fields.comment.value, isTeam: fields.isTeam.checked, photo: state.photo
    };
  }

  /** Сохранение. Снятие «Команда работников» у участника проектов требует подтверждения. Возвращает Promise<boolean>. */
  function submitForm() {
    if (state.photoBusy) return state.photoBusy.then(submitForm);
    var data = readForm();
    var errors = C.validate(data);
    Object.keys(fields).concat('photo').forEach(function (k) { setError(k, errors[k]); });
    var keys = Object.keys(errors);
    if (keys.length) { var f = fields[keys[0]] || $('cPhotoPick'); f.focus(); return Promise.resolve(false); }

    var id = state.editingId, prev = id ? C.get(id) : null;
    var used = prev && prev.isTeam && !data.isTeam ? T.projectsWith(id) : [];
    var ask = used.length
      ? UI.confirm('«' + prev.name + '» участвует в ' + used.length + ' ' + U.plural(used.length, 'проекте', 'проектах', 'проектах') + ' (' + projectNames(used) + '). Если снять отметку «Команда работников», контакт будет убран из команд этих проектов. Продолжить?', 'Снять и убрать')
      : Promise.resolve(true);
    return ask.then(function (ok) {
      if (!ok) { fields.isTeam.focus(); return false; }
      var saved;
      try { saved = id ? C.update(id, data) : C.create(data); }
      catch (e) {
        if (e.errors) { Object.keys(e.errors).forEach(function (k) { setError(k, e.errors[k]); }); return false; }
        UI.toast(e.message, 'error'); return false;
      }
      if (!saved) { UI.toast('Контакт не найден — возможно, он удалён в другой вкладке', 'error'); UI.closeModal($('contactModal')); return false; }
      var removed = used.length ? T.detach(id) : 0;
      var linked = saved.isTeam ? T.migrate() : 0;
      var msg = id ? 'Изменения сохранены' : 'Контакт создан';
      if (removed) msg += '; убран из команд проектов: ' + removed;
      if (linked) msg += '; связан по ФИО с проектами: ' + linked;
      UI.toast(msg, 'success');
      UI.closeModal($('contactModal'), 'saved');
      return true;
    });
  }

  /* ---------- Данные ---------- */
  function stamp() { var d = new Date(); return U.toISODate(d) + '_' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0'); }
  function exportJSON() { U.download('contacts_' + stamp() + '.json', C.exportJSON(), 'application/json;charset=utf-8'); UI.toast('Контакты сохранены в JSON'); }
  function exportCSV() {
    U.download('contacts_' + stamp() + '.csv', C.exportCSV(function (c) { return T.projectsWith(c.id).map(function (p) { return p.name; }); }), 'text/csv;charset=utf-8');
    UI.toast('CSV выгружен (без фото)');
  }
  /** Предупреждение о проектах, из команд которых пропадут контакты, отсутствующие в новом наборе. */
  function lossNote(nextIds) {
    var removed = C.all().map(function (c) { return c.id; }).filter(function (id) { return nextIds.indexOf(id) < 0; });
    var affected = T.projectsWith(removed.concat(T.missingIds()));
    return affected.length ? ' Отсутствующие в новом наборе контакты будут убраны из команд ' + affected.length + ' ' + U.plural(affected.length, 'проекта', 'проектов', 'проектов') + '.' : '';
  }
  function afterReplace() { T.pruneMissing(); T.migrate(); }

  function importText(text) {
    var list;
    try { list = C.parseList(text); }
    catch (e) { UI.toast('Ошибка импорта: ' + e.message, 'error'); return Promise.resolve(false); }
    var ids = list.map(function (c) { return C.normalize(c).id; });
    return UI.confirm('Заменить контакты (' + C.all().length + ') контактами из файла (' + list.length + ')? Проекты не изменятся.' + lossNote(ids), 'Импортировать').then(function (ok) {
      if (!ok) return false;
      try { var n = C.importJSON(text, 'replace'); afterReplace(); UI.toast('Импортировано контактов: ' + n, 'success'); return true; }
      catch (e) { UI.toast('Ошибка импорта: ' + e.message, 'error'); return false; }
    });
  }

  function onAction(action, trigger) {
    switch (action) {
      case 'new-contact': openForm(null, trigger); break;
      case 'export-json': exportJSON(); break;
      case 'export-csv': exportCSV(); break;
      case 'import-json': $('importFile').click(); break;
      case 'demo':
        return UI.confirm('Загрузить демо-контакты? Текущие контакты будут заменены, проекты не изменятся.' + lossNote(C.demoContacts().map(function (c) { return c.id; })), 'Загрузить').then(function (ok) {
          if (ok) {
            try { C.loadDemo(); afterReplace(); UI.toast('Демо-контакты загружены', 'success'); }
            catch (e) { UI.toast(e.message, 'error'); }
          }
          return ok;
        });
      case 'clear':
        return UI.confirm('Удалить все контакты (' + C.all().length + ')? Проекты останутся.' + lossNote([]) + ' Рекомендуем сначала сделать экспорт JSON.', 'Удалить контакты').then(function (ok) {
          if (ok) {
            try { C.clearAll(); afterReplace(); UI.toast('Все контакты удалены'); }
            catch (e) { UI.toast(e.message, 'error'); }
          }
          return ok;
        });
    }
    return Promise.resolve();
  }

  /* ---------- Переход по ссылке: #new или #contact=<id> ---------- */
  function clearHash() {
    try { global.history.replaceState(null, '', global.location.pathname + global.location.search); } catch (e) { /* noop */ }
  }
  function handleHash() {
    var hash = global.location.hash || '';
    if (hash === '#new') { clearHash(); openForm(null, $('main')); return; }
    var m = /^#contact=(.+)$/.exec(hash);
    if (!m) return;
    var id; try { id = decodeURIComponent(m[1]); } catch (e) { id = ''; }
    clearHash();
    if (C.get(id)) openDetails(id);
    else UI.toast('Контакт не найден', 'error');
  }

  /* ---------- Инициализация ---------- */
  function init() {
    initForm();
    state.view = SH.lsGet(VIEW_KEY) === 'table' ? 'table' : 'cards';
    document.querySelectorAll('[data-view]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.view === state.view));
      b.addEventListener('click', function () { setView(b.dataset.view); });
    });
    document.querySelectorAll('[data-action]').forEach(function (b) {
      b.addEventListener('click', function (e) { onAction(b.dataset.action, e.currentTarget); });
    });
    $('importFile').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () { importText(String(reader.result)); e.target.value = ''; };
      reader.onerror = function () { UI.toast('Не удалось прочитать файл', 'error'); };
      reader.readAsText(file);
    });

    var search = $('cSearch'), timer;
    search.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { state.filters.q = search.value; render(); }, 120);
    });
    $('filters').addEventListener('submit', function (e) { e.preventDefault(); state.filters.q = search.value; render(); });
    $('cType').addEventListener('change', function (e) { state.filters.type = e.target.value; render(); });
    $('cOrg').addEventListener('change', function (e) { state.filters.org = e.target.value; render(); });
    $('cSort').addEventListener('change', function (e) { state.sort = e.target.value; render(); });
    $('resetFilters').addEventListener('click', resetFilters);

    $('contactEdit').addEventListener('click', function () {
      var id = state.detailsId;
      UI.closeModal($('contactDetailsModal'));
      if (id) openForm(id);
    });
    $('contactDelete').addEventListener('click', function () { if (state.detailsId) deleteContact(state.detailsId); });

    SH.init({
      render: render,
      onStorage: function (e) { if (e.key === VIEW_KEY && e.newValue) setView(e.newValue); }
    });
    handleHash();
    global.addEventListener('hashchange', handleHash);
  }

  PD.contactsPage = {
    state: state, filtered: filtered, render: render, setView: setView, openForm: openForm, submitForm: submitForm,
    setPhotoFromFile: setPhotoFromFile, openDetails: openDetails, deleteContact: deleteContact, importText: importText,
    onAction: onAction, resetFilters: resetFilters, handleHash: handleHash
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
