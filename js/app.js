/* Точка входа: состояние фильтров, связка хранилища и интерфейса */
(function (global) {
  'use strict';
  var PD = global.PD = global.PD || {};
  var U = PD.utils, S = PD.store, UI = PD.ui, C = PD.charts;
  var h = U.h;

  var THEME_KEY = 'itpd.theme';
  var VIEW_KEY = 'itpd.view';

  var state = {
    filters: { q: '', status: '', priority: '', tech: '' },
    sort: 'deadline:asc',
    view: 'table',
    editingId: null,
    detailsId: null
  };

  function $(id) { return document.getElementById(id); }
  function lsGet(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { global.localStorage.setItem(k, v); } catch (e) { /* noop */ } }

  /* ---------- Фильтрация и сортировка ---------- */
  function filtered() {
    var f = state.filters, q = f.q.trim().toLowerCase();
    var list = S.all().filter(function (p) {
      if (f.status && p.status !== f.status) return false;
      if (f.priority && p.priority !== f.priority) return false;
      if (f.tech && !p.stack.some(function (t) { return t.toLowerCase() === f.tech.toLowerCase(); })) return false;
      if (q) {
        var hay = [p.name, p.client, p.description, p.repo].concat(p.stack, p.team, p.tags).join(' ').toLowerCase();
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
    UI.renderKPIs($('kpis'), S.stats());
    fillFilterOptions();
    var list = filtered();
    var total = S.all().length;
    $('projectsCount').textContent = list.length === total ? String(total) : list.length + ' из ' + total;
    if (state.view === 'kanban') UI.renderKanban($('projectsView'), list, handlers);
    else UI.renderTable($('projectsView'), list, handlers);
    C.donut($('chartStatus'), list);
    C.budgetBars($('chartBudget'), list);
    C.techBars($('chartTech'), list);
    C.deadlines($('chartDeadlines'), list, openDetails);
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
    Object.keys(fields).forEach(function (k) {
      fields[k].addEventListener('input', function () { setError(k, ''); });
    });
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
    fields.team.value = (d.team || []).join(', ');
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
      name: fields.name.value.trim(), client: fields.client.value, team: fields.team.value, description: fields.description.value,
      status: fields.status.value, priority: fields.priority.value, stack: fields.stack.value, start: fields.start.value,
      deadline: fields.deadline.value, budget: fields.budget.value.trim(), spent: fields.spent.value.trim(),
      progress: fields.progress.value, autoProgress: fields.autoProgress.checked, repo: fields.repo.value.trim(), tags: fields.tags.value
    };
  }

  function submitForm() {
    var data = readForm();
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
    UI.renderDetails($('detailsBody'), p, detailHandlers);
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
  function exportJSON() { U.download('it-projects_' + stamp() + '.json', S.exportJSON(), 'application/json;charset=utf-8'); UI.toast('Резервная копия сохранена'); }
  function exportCSV() { U.download('it-projects_' + stamp() + '.csv', S.exportCSV(), 'text/csv;charset=utf-8'); UI.toast('CSV выгружен'); }

  function importText(text) {
    var preview;
    try {
      var data = JSON.parse(text);
      preview = Array.isArray(data) ? data : (data && data.projects);
      if (!Array.isArray(preview)) throw new Error('В файле не найден список проектов');
    } catch (e) {
      UI.toast('Ошибка импорта: ' + (e instanceof SyntaxError ? 'файл не является корректным JSON' : e.message), 'error');
      return Promise.resolve(false);
    }
    return UI.confirm('Заменить текущие данные (' + S.all().length + ' пр.) проектами из файла (' + preview.length + ' пр.)?', 'Импортировать').then(function (ok) {
      if (!ok) return false;
      try { var n = S.importJSON(text, 'replace'); UI.toast('Импортировано проектов: ' + n, 'success'); return true; }
      catch (e) { UI.toast('Ошибка импорта: ' + e.message, 'error'); return false; }
    });
  }

  function onAction(action, trigger) {
    switch (action) {
      case 'new-project': openForm(null, trigger); break;
      case 'export-json': exportJSON(); break;
      case 'export-csv': exportCSV(); break;
      case 'import-json': $('importFile').click(); break;
      case 'demo':
        return UI.confirm('Загрузить демо-данные? Текущие проекты будут заменены.', 'Загрузить').then(function (ok) {
          if (ok) { S.loadDemo(); UI.toast('Демо-данные загружены', 'success'); }
          return ok;
        });
      case 'clear':
        return UI.confirm('Удалить все проекты? Рекомендуем сначала сделать экспорт JSON.', 'Очистить всё').then(function (ok) {
          if (ok) { S.clearAll(); UI.toast('Все данные удалены'); }
          return ok;
        });
    }
    return Promise.resolve();
  }

  /* ---------- Тема ---------- */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    var btn = $('themeBtn');
    btn.setAttribute('aria-pressed', String(theme === 'dark'));
    btn.setAttribute('aria-label', theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему');
  }
  function toggleTheme() {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    lsSet(THEME_KEY, next);
    applyTheme(next);
  }

  /* ---------- Боковое меню (мобильные) ---------- */
  function setMenu(open) {
    $('sidebar').classList.toggle('is-open', open);
    $('sidebarBackdrop').hidden = !open;
    $('menuBtn').setAttribute('aria-expanded', String(open));
    $('menuBtn').setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
  }

  /* ---------- Инициализация ---------- */
  function init() {
    UI.initModals();
    initForm();
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

    var today = U.today();
    try { $('todayLabel').textContent = 'Сегодня: ' + today.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
    catch (e) { $('todayLabel').textContent = 'Сегодня: ' + U.formatDate(U.toISODate(today)); }

    state.view = lsGet(VIEW_KEY) === 'kanban' ? 'kanban' : 'table';
    document.querySelectorAll('[data-view]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.view === state.view));
      b.addEventListener('click', function () { setView(b.dataset.view); });
    });

    $('themeBtn').addEventListener('click', toggleTheme);
    document.querySelectorAll('[data-action]').forEach(function (b) {
      b.addEventListener('click', function (e) { setMenu(false); onAction(b.dataset.action, e.currentTarget); });
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

    $('menuBtn').addEventListener('click', function () { setMenu(!$('sidebar').classList.contains('is-open')); });
    $('sidebarBackdrop').addEventListener('click', function () { setMenu(false); });
    document.querySelectorAll('.nav-link').forEach(function (a) {
      a.addEventListener('click', function () {
        document.querySelectorAll('.nav-link').forEach(function (x) { x.removeAttribute('aria-current'); });
        a.setAttribute('aria-current', 'true');
        setMenu(false);
      });
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && $('sidebar').classList.contains('is-open')) setMenu(false); });

    // Синхронизация между вкладками
    global.addEventListener('storage', function (e) {
      if (e.key === S.STORAGE_KEY || e.key === null) { S.reload(); }
      else if (e.key === THEME_KEY && (e.newValue === 'dark' || e.newValue === 'light')) applyTheme(e.newValue);
      else if (e.key === VIEW_KEY && e.newValue) { state.view = e.newValue === 'kanban' ? 'kanban' : 'table'; setView(state.view); }
    });

    S.subscribe(function (reason) {
      render();
      if (reason === 'sync') UI.toast('Данные обновлены в другой вкладке');
    });
    S.load();
    if (!S.storageOk()) UI.toast('localStorage недоступен — данные не сохранятся', 'error');
  }

  PD.app = {
    state: state, filtered: filtered, render: render, setView: setView, openForm: openForm, submitForm: submitForm,
    openDetails: openDetails, deleteProject: deleteProject, changeStatus: changeStatus, importText: importText, onAction: onAction,
    toggleTheme: toggleTheme, resetFilters: resetFilters
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
