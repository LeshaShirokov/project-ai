/* Страница «Проекты»: состояние фильтров, форма проекта, карточка, импорт/экспорт */
(function (global) {
  'use strict';
  var PD = global.PD = global.PD || {};
  var U = PD.utils, S = PD.store, C = PD.contacts, T = PD.team, UI = PD.ui, V = PD.views, SH = PD.shell;
  var h = U.h;

  var VIEW_KEY = 'itpd.view';

  var state = {
    filters: { q: '', status: '', priority: '', tech: '' },
    sort: 'deadline:asc',
    view: 'table',
    editingId: null,
    detailsId: null,
    unknownTeamIds: [] // участники, которых нет в контактах (сохраняются как есть)
  };

  function $(id) { return document.getElementById(id); }
  var lsGet = SH.lsGet, lsSet = SH.lsSet;

  /* ---------- Фильтрация и сортировка ---------- */
  function filtered() {
    var f = state.filters, q = f.q.trim().toLowerCase();
    var list = S.all().filter(function (p) {
      if (f.status && p.status !== f.status) return false;
      if (f.priority && p.priority !== f.priority) return false;
      if (f.tech && !p.stack.some(function (t) { return t.toLowerCase() === f.tech.toLowerCase(); })) return false;
      if (q) {
        var hay = [p.name, p.client, p.description, p.repo].concat(p.stack, T.names(p), p.tags).join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    var parts = state.sort.split(':'), key = parts[0], dir = parts[1] === 'desc' ? -1 : 1;
    list.sort(function (a, b) {
      var r = 0;
      if (key === 'deadline') {
        // завершённые и отменённые проекты — после текущих
        var fa = a.status === 'done' || a.status === 'cancelled', fb = b.status === 'done' || b.status === 'cancelled';
        if (fa !== fb) return fa ? 1 : -1;
        if (!a.deadline && !b.deadline) r = 0;
        else if (!a.deadline) return 1; // проекты без дедлайна — всегда в конце
        else if (!b.deadline) return -1;
        else r = a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0;
      } else if (key === 'priority') r = S.priorityWeight(a.priority) - S.priorityWeight(b.priority);
      else if (key === 'progress') r = a.progress - b.progress;
      else if (key === 'budget') r = a.budget - b.budget;
      else if (key === 'name') r = a.name.localeCompare(b.name, 'ru');
      return r * dir || a.name.localeCompare(b.name, 'ru');
    });
    return list;
  }

  /* ---------- Отрисовка ---------- */
  var handlers = {
    open: function (id) { openDetails(id); },
    edit: function (id, trigger) { openForm(id, trigger); },
    create: function (trigger) { openForm(null, trigger); },
    remove: function (id) { deleteProject(id); },
    setStatus: function (id, status) { changeStatus(id, status); },
    resetFilters: function () { resetFilters(); }
  };

  function fillFilterOptions() {
    var techSel = $('fTech'), current = state.filters.tech;
    var techs = {};
    S.all().forEach(function (p) { p.stack.forEach(function (t) { techs[t.toLowerCase()] = techs[t.toLowerCase()] || t; }); });
    var names = Object.keys(techs).map(function (k) { return techs[k]; }).sort(function (a, b) { return a.localeCompare(b, 'ru'); });
    U.clear(techSel).appendChild(h('option', { value: '' }, 'Все'));
    names.forEach(function (n) { techSel.appendChild(h('option', { value: n, selected: n.toLowerCase() === current.toLowerCase() }, n)); });
    if (current && !techs[current.toLowerCase()]) { state.filters.tech = ''; techSel.value = ''; }
    var dl = U.clear($('techList'));
    names.forEach(function (n) { dl.appendChild(h('option', { value: n })); });
  }

  function render() {
    var focusKey = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.focusKey : null;
    fillFilterOptions();
    var list = filtered();
    var total = S.all().length;
    $('projectsCount').textContent = list.length === total ? String(total) : list.length + ' из ' + total;
    if (state.view === 'kanban') V.renderKanban($('projectsView'), list, handlers);
    else V.renderTable($('projectsView'), list, handlers);
    if (!$('projectModal').hidden) renderTeamPicker(selectedTeamIds().concat(state.unknownTeamIds));
    if (state.detailsId) {
      var p = S.get(state.detailsId);
      if (p) renderDetails(p); else UI.closeModal($('detailsModal'));
    }
    if (focusKey) {
      var el = document.querySelector('[data-focus-key="' + focusKey.replace(/"/g, '') + '"]');
      if (el) el.focus();
    }
  }

  function setView(view) {
    state.view = view === 'kanban' ? 'kanban' : 'table';
    lsSet(VIEW_KEY, state.view);
    document.querySelectorAll('[data-view]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.view === state.view)); });
    render();
  }

  function resetFilters() {
    state.filters = { q: '', status: '', priority: '', tech: '' };
    $('fSearch').value = ''; $('fStatus').value = ''; $('fPriority').value = ''; $('fTech').value = '';
    render();
  }

  /* ---------- Действия ---------- */
  function changeStatus(id, status) {
    var p = S.get(id);
    if (!p || p.status === status) return;
    S.setStatus(id, status);
    UI.toast('«' + p.name + '» → ' + S.statusLabel(status));
  }

  function deleteProject(id) {
    var p = S.get(id);
    if (!p) return Promise.resolve(false);
    return UI.confirm('Удалить проект «' + p.name + '»? Это действие нельзя отменить.', 'Удалить').then(function (ok) {
      if (!ok) return false;
      if (state.detailsId === id) UI.closeModal($('detailsModal'));
      S.remove(id);
      UI.toast('Проект удалён');
      return true;
    });
  }

  /* ---------- Форма проекта ---------- */
  var form, fields;
  function initForm() {
    form = $('projectForm');
    fields = {
      name: $('pName'), client: $('pClient'), team: $('pTeam'), description: $('pDesc'), status: $('pStatus'), priority: $('pPriority'),
      stack: $('pStack'), start: $('pStart'), deadline: $('pDeadline'), budget: $('pBudget'), spent: $('pSpent'),
      progress: $('pProgress'), autoProgress: $('pAuto'), repo: $('pRepo'), tags: $('pTags')
    };
    S.STATUSES.forEach(function (s) { fields.status.appendChild(h('option', { value: s.id }, s.label)); $('fStatus').appendChild(h('option', { value: s.id }, s.label)); });
    S.PRIORITIES.forEach(function (p) { fields.priority.appendChild(h('option', { value: p.id }, p.label)); $('fPriority').appendChild(h('option', { value: p.id }, p.label)); });
    fields.progress.addEventListener('input', syncProgressOut);
    fields.autoProgress.addEventListener('change', syncAuto);
    form.addEventListener('submit', function (e) { e.preventDefault(); submitForm(); });
    $('pTeamSearch').addEventListener('input', filterTeamPicker);
    $('pTeamSearch').addEventListener('keydown', function (e) { if (e.key === 'Enter') e.preventDefault(); });
    $('pTeamList').addEventListener('change', updateTeamCount);
    Object.keys(fields).forEach(function (k) {
      fields[k].addEventListener('input', function () { setError(k, ''); });
    });
  }
  /* ---------- Выбор команды из контактов ---------- */
  function selectedTeamIds() {
    return Array.prototype.map.call($('pTeamList').querySelectorAll('input[type="checkbox"]:checked'), function (cb) { return cb.value; });
  }
  function updateTeamCount() {
    var n = selectedTeamIds().length + state.unknownTeamIds.length;
    $('pTeamCount').textContent = n ? '— выбрано: ' + n : '';
  }
  /** Чек-лист сотрудников (контакты с «Команда работников») + уже выбранные контакты без этой отметки. */
  function renderTeamPicker(selected) {
    var list = $('pTeamList'), hint = $('pTeamHint');
    var pool = C.team();
    selected.forEach(function (id) { var c = C.get(id); if (c && !c.isTeam) pool.push(c); });
    state.unknownTeamIds = selected.filter(function (id) { return !C.get(id); });
    pool.sort(function (a, b) { return a.name.localeCompare(b.name, 'ru'); });
    U.clear(list);
    pool.forEach(function (c) {
      var cbId = 'pTeam-' + c.id;
      list.appendChild(h('li', { class: 'team-option', dataset: { search: [c.name, c.org, c.email].join(' ').toLowerCase() } }, [
        h('input', { type: 'checkbox', id: cbId, value: c.id, checked: selected.indexOf(c.id) >= 0 }),
        h('label', { for: cbId }, [
          UI.avatar(c),
          h('span', { class: 'team-option-text' }, [
            h('span', { class: 'team-option-name' }, c.name),
            c.org || !c.isTeam ? h('small', { class: 'muted' }, [c.org, !c.isTeam ? '(не в команде работников)' : ''].filter(Boolean).join(' ')) : null
          ])
        ])
      ]));
    });
    list.appendChild(h('li', { class: 'team-empty muted', hidden: true }, 'Никого не найдено'));
    list.hidden = !pool.length;
    $('pTeamSearch').parentNode.hidden = pool.length < 2;
    U.clear(hint);
    if (!pool.length) {
      hint.appendChild(document.createTextNode('В контактах пока нет сотрудников с отметкой «Команда работников». '));
      hint.appendChild(h('a', { href: 'contacts.html#new' }, 'Добавить контакт'));
    } else {
      hint.appendChild(document.createTextNode('Список — контакты с отметкой «Команда работников». '));
      hint.appendChild(h('a', { href: 'contacts.html' }, 'Открыть контакты'));
    }
    if (state.unknownTeamIds.length) hint.appendChild(h('span', { class: 'block' }, 'Ещё ' + state.unknownTeamIds.length + ' участн. нет в контактах — они сохранятся без изменений.'));
    filterTeamPicker();
    updateTeamCount();
  }
  function filterTeamPicker() {
    var q = $('pTeamSearch').value.trim().toLowerCase(), any = false;
    $('pTeamList').querySelectorAll('.team-option').forEach(function (li) {
      var show = !q || li.dataset.search.indexOf(q) >= 0;
      li.hidden = !show; if (show) any = true;
    });
    var empty = $('pTeamList').querySelector('.team-empty');
    if (empty) empty.hidden = any;
  }

  function syncProgressOut() { $('pProgressOut').textContent = fields.progress.value + '%'; }
  function syncAuto() {
    var p = state.editingId ? S.get(state.editingId) : null;
    var hasTasks = p && p.tasks.length;
    fields.progress.disabled = fields.autoProgress.checked && !!hasTasks;
    if (fields.progress.disabled) { fields.progress.value = S.taskProgress(p.tasks); syncProgressOut(); }
  }
  function setError(name, msg) {
    var el = $('err-' + name);
    if (el) el.textContent = msg || '';
    if (fields[name]) {
      if (msg) fields[name].setAttribute('aria-invalid', 'true'); else fields[name].removeAttribute('aria-invalid');
    }
  }

  function openForm(id, trigger) {
    var p = id ? S.get(id) : null;
    state.editingId = p ? p.id : null;
    $('projectModalTitle').textContent = p ? 'Редактирование проекта' : 'Новый проект';
    form.reset();
    Object.keys(fields).forEach(function (k) { setError(k, ''); });
    var d = p || { status: 'planning', priority: 'medium', progress: 0, start: U.toISODate(U.today()) };
    fields.name.value = d.name || '';
    fields.client.value = d.client || '';
    // Старые текстовые имена, совпавшие с сотрудником из контактов, сразу отмечаются в списке
    var legacy = T.matchLegacy(d.team || []);
    fields.team.value = legacy.rest.join(', ');
    $('pTeamSearch').value = '';
    renderTeamPicker((d.teamIds || []).concat(legacy.ids.filter(function (id) { return (d.teamIds || []).indexOf(id) < 0; })));
    fields.description.value = d.description || '';
    fields.status.value = d.status;
    fields.priority.value = d.priority;
    fields.stack.value = (d.stack || []).join(', ');
    fields.start.value = d.start || '';
    fields.deadline.value = d.deadline || '';
    fields.budget.value = p ? String(d.budget) : '';
    fields.spent.value = p ? String(d.spent) : '';
    fields.progress.value = String(d.progress || 0);
    fields.autoProgress.checked = !!d.autoProgress;
    fields.repo.value = d.repo || '';
    fields.tags.value = (d.tags || []).join(', ');
    syncProgressOut(); syncAuto();
    UI.openModal($('projectModal'), { returnFocus: trigger || document.activeElement, initialFocus: fields.name, onClose: function () { state.editingId = null; } });
  }

  function readForm() {
    return {
      name: fields.name.value.trim(), client: fields.client.value, team: fields.team.value,
      teamIds: selectedTeamIds().concat(state.unknownTeamIds), description: fields.description.value,
      status: fields.status.value, priority: fields.priority.value, stack: fields.stack.value, start: fields.start.value,
      deadline: fields.deadline.value, budget: fields.budget.value.trim(), spent: fields.spent.value.trim(),
      progress: fields.progress.value, autoProgress: fields.autoProgress.checked, repo: fields.repo.value.trim(), tags: fields.tags.value
    };
  }

  function submitForm() {
    var data = readForm();
    // Имена, введённые текстом, но совпавшие с сотрудником из контактов, превращаются в ссылки на контакт
    var typed = T.matchLegacy(U.splitList(data.team));
    data.team = typed.rest;
    typed.ids.forEach(function (id) { if (data.teamIds.indexOf(id) < 0) data.teamIds.push(id); });
    var errors = S.validate(data);
    Object.keys(fields).forEach(function (k) { setError(k, errors[k]); });
    var keys = Object.keys(errors);
    if (keys.length) { if (fields[keys[0]]) fields[keys[0]].focus(); return false; }
    try {
      if (state.editingId) { S.update(state.editingId, data); UI.toast('Изменения сохранены', 'success'); }
      else { S.create(data); UI.toast('Проект создан', 'success'); }
    } catch (e) {
      if (e.errors) { Object.keys(e.errors).forEach(function (k) { setError(k, e.errors[k]); }); return false; }
      throw e;
    }
    UI.closeModal($('projectModal'), 'saved');
    return true;
  }

  /* ---------- Карточка проекта ---------- */
  var detailHandlers = {
    addTask: function (id, text) { S.addTask(id, text); var i = $('taskInput'); if (i) i.focus(); },
    toggleTask: function (id, tid, done) { S.toggleTask(id, tid, done); },
    removeTask: function (id, tid) { S.removeTask(id, tid); var i = $('taskInput'); if (i) i.focus(); },
    setAuto: function (id, on) { S.setAutoProgress(id, on); var c = $('detailsAuto'); if (c) c.focus(); }
  };
  function renderDetails(p) {
    $('detailsTitle').textContent = p.name;
    V.renderDetails($('detailsBody'), p, detailHandlers);
  }
  function openDetails(id) {
    var p = S.get(id);
    if (!p) return;
    state.detailsId = id;
    renderDetails(p);
    UI.openModal($('detailsModal'), { onClose: function () { state.detailsId = null; } });
  }

  /* ---------- Данные ---------- */
  function stamp() { var d = new Date(); return U.toISODate(d) + '_' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0'); }
  function exportJSON() { U.download('it-projects_' + stamp() + '.json', S.exportJSON({ contacts: C.all() }), 'application/json;charset=utf-8'); UI.toast('Резервная копия сохранена'); }
  function exportCSV() { U.download('it-projects_' + stamp() + '.csv', S.exportCSV(T.names), 'text/csv;charset=utf-8'); UI.toast('CSV выгружен'); }

  /**
   * Импорт резервной копии. Старый формат (только projects) по-прежнему поддерживается;
   * если в файле есть раздел contacts (новые копии), контакты тоже заменяются.
   */
  function importText(text) {
    var preview, contacts = null;
    try {
      var data = JSON.parse(text);
      preview = Array.isArray(data) ? data : (data && data.projects);
      if (!Array.isArray(preview)) throw new Error('В файле не найден список проектов');
      if (data && Array.isArray(data.contacts)) contacts = data.contacts;
    } catch (e) {
      UI.toast('Ошибка импорта: ' + (e instanceof SyntaxError ? 'файл не является корректным JSON' : e.message), 'error');
      return Promise.resolve(false);
    }
    var msg = 'Заменить текущие данные (' + S.all().length + ' пр.) проектами из файла (' + preview.length + ' пр.)?';
    if (contacts) msg = 'Заменить текущие данные (' + S.all().length + ' пр., ' + C.all().length + ' конт.) данными из файла (' + preview.length + ' пр., ' + contacts.length + ' конт.)?';
    else msg += ' Контакты не изменятся.';
    return UI.confirm(msg, 'Импортировать').then(function (ok) {
      if (!ok) return false;
      try {
        var nc = contacts ? C.importJSON(text, 'replace') : 0;
        var n = S.importJSON(text, 'replace');
        T.migrate();
        UI.toast('Импортировано проектов: ' + n + (contacts ? ', контактов: ' + nc : ''), 'success');
        return true;
      } catch (e) { UI.toast('Ошибка импорта: ' + e.message, 'error'); return false; }
    });
  }

  function onAction(action, trigger) {
    switch (action) {
      case 'new-project': openForm(null, trigger); break;
      case 'export-json': exportJSON(); break;
      case 'export-csv': exportCSV(); break;
      case 'import-json': $('importFile').click(); break;
      case 'demo':
        return UI.confirm('Загрузить демо-проекты? Текущие проекты будут заменены, контакты не изменятся.', 'Загрузить').then(function (ok) {
          if (ok) { S.loadDemo(); T.migrate(); UI.toast('Демо-проекты загружены', 'success'); }
          return ok;
        });
      case 'clear':
        return UI.confirm('Удалить все проекты? Контакты останутся. Рекомендуем сначала сделать экспорт JSON.', 'Удалить проекты').then(function (ok) {
          if (ok) { S.clearAll(); UI.toast('Все проекты удалены'); }
          return ok;
        });
    }
    return Promise.resolve();
  }

  /* ---------- Переход по ссылке: #new или #project=<id> ---------- */
  function clearHash() {
    try { global.history.replaceState(null, '', global.location.pathname + global.location.search); } catch (e) { /* noop */ }
  }
  function handleHash() {
    var hash = global.location.hash || '';
    if (hash === '#new') { clearHash(); openForm(null, $('main')); return; }
    var m = /^#project=(.+)$/.exec(hash);
    if (!m) return;
    var id; try { id = decodeURIComponent(m[1]); } catch (e) { id = ''; }
    clearHash();
    if (S.get(id)) openDetails(id);
    else UI.toast('Проект не найден', 'error');
  }

  /* ---------- Инициализация ---------- */
  function init() {
    initForm();

    state.view = lsGet(VIEW_KEY) === 'kanban' ? 'kanban' : 'table';
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

    var search = $('fSearch'), timer;
    search.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { state.filters.q = search.value; render(); }, 120);
    });
    $('filters').addEventListener('submit', function (e) { e.preventDefault(); state.filters.q = search.value; render(); });
    $('fStatus').addEventListener('change', function (e) { state.filters.status = e.target.value; render(); });
    $('fPriority').addEventListener('change', function (e) { state.filters.priority = e.target.value; render(); });
    $('fTech').addEventListener('change', function (e) { state.filters.tech = e.target.value; render(); });
    $('fSort').addEventListener('change', function (e) { state.sort = e.target.value; render(); });
    $('resetFilters').addEventListener('click', resetFilters);

    $('detailsEdit').addEventListener('click', function () {
      var id = state.detailsId;
      UI.closeModal($('detailsModal'));
      if (id) openForm(id);
    });
    $('detailsDelete').addEventListener('click', function () { if (state.detailsId) deleteProject(state.detailsId); });

    SH.init({
      render: render,
      onStorage: function (e) { if (e.key === VIEW_KEY && e.newValue) setView(e.newValue); }
    });
    handleHash();
    global.addEventListener('hashchange', handleHash);
  }

  PD.app = {
    state: state, filtered: filtered, render: render, setView: setView, openForm: openForm, submitForm: submitForm,
    openDetails: openDetails, deleteProject: deleteProject, changeStatus: changeStatus, importText: importText, onAction: onAction,
    resetFilters: resetFilters, handleHash: handleHash
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
