/* Страница «Календарь»: задачи со сроком закрытия и дедлайны проектов — виды День / Неделя / Месяц */
(function (global) {
  'use strict';
  var PD = global.PD = global.PD || {};
  var U = PD.utils, S = PD.store, UI = PD.ui, SH = PD.shell, D = PD.calDates;
  var h = U.h;

  var STATE_KEY = 'itpd.calendar';
  var MONTH_CHIPS = 3; // сколько элементов помещается в ячейку месяца, остальное — «+N ещё»

  var state = {
    view: 'month',
    date: D.todayISO(),
    selected: null, // выбранный день в сетке месяца (список под сеткой)
    filters: { project: '', status: '', deadlines: true },
    openItem: null // {kind, projectId, taskId} — элемент, открытый в окне
  };

  function $(id) { return document.getElementById(id); }

  /* ---------- Цвет проекта (стабильный по id) ---------- */
  function projectHue(p) { return UI.hue('p:' + (p && p.id || '')); }
  function colorStyle(p) { return '--pc:hsl(' + projectHue(p) + ' 70% 48%)'; }

  /* ---------- Элементы календаря ---------- */
  function isClosedProject(p) { return p.status === 'done' || p.status === 'cancelled'; }

  function taskItem(p, t) {
    return { key: 't:' + p.id + ':' + t.id, kind: 'task', date: t.due, project: p, task: t, title: t.text, done: !!t.done, overdue: S.isTaskOverdue(t) };
  }
  function projectItem(p, kind) {
    var date = kind === 'deadline' ? p.deadline : p.start;
    return { key: kind + ':' + p.id, kind: kind, date: date, project: p, task: null,
      title: kind === 'deadline' ? 'Дедлайн проекта' : 'Старт проекта', done: isClosedProject(p), overdue: kind === 'deadline' && S.isOverdue(p) };
  }

  function passProject(p, f) { return !f.project || p.id === f.project; }
  function passStatus(item, f) {
    if (f.status === 'open') return !item.done;
    if (f.status === 'done') return item.done;
    return true;
  }

  /** Порядок внутри дня: дедлайны, старты, просроченные, открытые, выполненные; затем проект и название. */
  var KIND_ORDER = { deadline: 0, start: 1, task: 2 };
  function compareItems(a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    var r = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    if (r) return r;
    r = (b.overdue ? 1 : 0) - (a.overdue ? 1 : 0); if (r) return r;
    r = (a.done ? 1 : 0) - (b.done ? 1 : 0); if (r) return r;
    return a.project.name.localeCompare(b.project.name, 'ru') || a.title.localeCompare(b.title, 'ru');
  }

  /**
   * Все элементы в диапазоне [from, to] с учётом фильтров.
   * projects — список проектов; filters — {project, status, deadlines}.
   */
  function collect(projects, from, to, filters) {
    var f = filters || {}, out = [];
    function inRange(d) { return d && d >= from && d <= to; }
    projects.forEach(function (p) {
      if (!passProject(p, f)) return;
      p.tasks.forEach(function (t) {
        if (!inRange(t.due)) return;
        var it = taskItem(p, t);
        if (passStatus(it, f)) out.push(it);
      });
      if (f.deadlines !== false) {
        ['deadline', 'start'].forEach(function (k) {
          var d = k === 'deadline' ? p.deadline : p.start;
          if (!inRange(d)) return;
          var it = projectItem(p, k);
          if (passStatus(it, f)) out.push(it);
        });
      }
    });
    return out.sort(compareItems);
  }

  /** Просроченное на сегодня: открытые задачи со сроком в прошлом и просроченные дедлайны проектов. */
  function collectOverdue(projects, filters) {
    var f = filters || {}, out = [];
    if (f.status === 'done') return out;
    projects.forEach(function (p) {
      if (!passProject(p, f)) return;
      p.tasks.forEach(function (t) { if (S.isTaskOverdue(t)) out.push(taskItem(p, t)); });
      if (f.deadlines !== false && S.isOverdue(p)) out.push(projectItem(p, 'deadline'));
    });
    return out.sort(compareItems);
  }

  /** Задачи без срока (с учётом фильтра по проекту и статусу). */
  function countUndated(projects, filters) {
    var f = filters || {}, n = 0;
    projects.forEach(function (p) {
      if (!passProject(p, f)) return;
      p.tasks.forEach(function (t) {
        if (t.due) return;
        if (f.status === 'open' && t.done) return;
        if (f.status === 'done' && !t.done) return;
        n++;
      });
    });
    return n;
  }

  function groupByDate(items) {
    var map = {};
    items.forEach(function (it) { (map[it.date] = map[it.date] || []).push(it); });
    return map;
  }

  /* ---------- Подписи ---------- */
  function statusText(item) {
    if (item.kind === 'task') return item.done ? 'Выполнена' : item.overdue ? 'Просрочена' : 'Открыта';
    if (item.kind === 'deadline' && item.overdue) return 'Просрочен · ' + S.statusLabel(item.project.status);
    return S.statusLabel(item.project.status);
  }
  function kindLabel(item) { return item.kind === 'task' ? 'Задача' : item.title; }
  function itemAria(item) {
    return kindLabel(item) + (item.kind === 'task' ? ' «' + item.title + '»' : '') + ', проект «' + item.project.name + '», ' + statusText(item).toLowerCase() + ', ' + D.longLabel(item.date);
  }
  function itemClass(item, base) {
    return base + ' kind-' + item.kind + (item.done ? ' is-done' : '') + (item.overdue ? ' is-overdue' : '');
  }
  function icon(item) { return item.kind === 'deadline' ? '⚑' : item.kind === 'start' ? '▶' : item.done ? '✓' : item.overdue ? '!' : '•'; }

  /* ---------- Элементы интерфейса ---------- */
  /** Компактная «фишка» для сетки месяца. */
  function chip(item) {
    var text = item.kind === 'task' ? item.title : item.title.replace(' проекта', '') + ': ' + item.project.name;
    return h('li', null, h('button', {
      type: 'button', class: itemClass(item, 'cal-chip'), style: colorStyle(item.project),
      title: itemAria(item), 'aria-label': itemAria(item), dataset: { focusKey: 'chip-' + item.key },
      onclick: function (e) { openItem(item, e.currentTarget); }
    }, [h('span', { class: 'cal-chip-ico', 'aria-hidden': 'true' }, icon(item)), h('span', { class: 'cal-chip-text' }, text)]));
  }

  /** Полная карточка для недели/дня: цвет и название проекта, заголовок, статус, отметка выполнения. */
  function card(item, opts) {
    opts = opts || {};
    var p = item.project, cbId = 'cb-' + (opts.prefix || '') + item.key.replace(/[^\w-]/g, '_');
    var toggle = item.kind === 'task'
      ? h('input', { type: 'checkbox', id: cbId, class: 'cal-check', checked: item.done, dataset: { focusKey: 'cb-' + (opts.prefix || '') + item.key },
          'aria-label': (item.done ? 'Отметить невыполненной: ' : 'Отметить выполненной: ') + item.title,
          onchange: function (e) { toggleTask(p.id, item.task.id, e.target.checked); } })
      : h('span', { class: 'cal-card-ico', 'aria-hidden': 'true' }, icon(item));
    var badgeCls = item.overdue ? 'badge-danger' : item.done ? 'badge-muted' : item.kind === 'task' ? 'badge-open' : 'badge-warn';
    return h('li', { class: itemClass(item, 'cal-card'), style: colorStyle(p) }, [
      toggle,
      h('div', { class: 'cal-card-main' }, [
        h('span', { class: 'cal-card-project' }, [h('span', { class: 'dot cal-dot', 'aria-hidden': 'true' }), p.name]),
        h('button', { type: 'button', class: 'link-btn cal-card-title', dataset: { focusKey: 'open-' + (opts.prefix || '') + item.key },
          'aria-label': 'Подробнее: ' + itemAria(item), onclick: function (e) { openItem(item, e.currentTarget); } },
          item.title),
        h('span', { class: 'cal-card-meta' }, [
          h('span', { class: 'badge ' + badgeCls }, statusText(item)),
          opts.showDate ? h('small', { class: 'muted' }, U.formatDate(item.date) + ' · ' + U.daysLabel(U.daysUntil(item.date))) : null
        ])
      ])
    ]);
  }

  function addBtn(date, label, cls) {
    return h('button', { type: 'button', class: cls || 'icon-btn sm cal-add', 'aria-label': 'Добавить задачу на ' + D.longLabel(date), title: 'Добавить задачу',
      onclick: function (e) { openTaskForm(date, e.currentTarget); } }, label || '＋');
  }

  /* ---------- Вид «Месяц» ---------- */
  function renderMonth(root, projects) {
    var weeks = D.monthGrid(state.date), r = D.range('month', state.date), today = D.todayISO();
    var byDate = groupByDate(collect(projects, r.from, r.to, state.filters));
    var grid = h('div', { class: 'cal-month', role: 'grid', 'aria-label': D.title('month', state.date), 'aria-readonly': 'true' });
    grid.appendChild(h('div', { class: 'cal-row cal-weekdays', role: 'row' }, D.WEEKDAYS_SHORT.map(function (w, i) {
      return h('div', { class: 'cal-wd' + (i > 4 ? ' is-weekend' : ''), role: 'columnheader', 'aria-label': D.WEEKDAYS[i] }, w);
    })));
    weeks.forEach(function (week) {
      grid.appendChild(h('div', { class: 'cal-row', role: 'row' }, week.map(function (day) {
        var items = byDate[day] || [], wd = D.weekday(day), d = +day.slice(8);
        var isToday = day === today, out = !D.sameMonth(day, state.date), isSel = day === state.date;
        var shown = items.slice(0, MONTH_CHIPS), more = items.length - shown.length;
        var hasOverdue = items.some(function (i) { return i.overdue; });
        var label = D.longLabel(day) + (isToday ? ', сегодня' : '') + (items.length ? ', элементов: ' + items.length : ', пусто') + (hasOverdue ? ', есть просроченные' : '');
        return h('div', { class: 'cal-cell' + (out ? ' is-out' : '') + (isToday ? ' is-today' : '') + (isSel ? ' is-selected' : '') + (wd > 4 ? ' is-weekend' : ''),
          role: 'gridcell', 'aria-selected': String(isSel), dataset: { date: day } }, [
          h('div', { class: 'cal-cell-head' }, [
            h('button', { type: 'button', class: 'cal-daynum', tabindex: isSel ? '0' : '-1', 'aria-label': label, 'aria-current': isToday ? 'date' : null,
              dataset: { date: day, focusKey: 'day-' + day }, onclick: function () { selectDay(day); } }, String(d)),
            h('button', { type: 'button', class: 'cal-add-mini', tabindex: '-1', 'aria-hidden': 'true', title: 'Добавить задачу на ' + D.shortLabel(day), onclick: function (e) { openTaskForm(day, e.currentTarget); } }, '＋')
          ]),
          items.length ? h('ul', { class: 'cal-chips' }, shown.map(chip)) : null,
          more > 0 ? h('button', { type: 'button', class: 'cal-more', 'aria-label': 'Ещё ' + more + ' — открыть ' + D.longLabel(day), onclick: function () { go('day', day); } }, '+' + more + ' ещё') : null,
          items.length ? h('div', { class: 'cal-dots', 'aria-hidden': 'true' }, items.slice(0, 4).map(function (it) {
            return h('span', { class: itemClass(it, 'cal-dotmark'), style: colorStyle(it.project) });
          }).concat(items.length > 4 ? [h('span', { class: 'cal-dots-more' }, '+' + (items.length - 4))] : [])) : null
        ]);
      })));
    });
    grid.addEventListener('keydown', gridKeys);
    root.appendChild(h('div', { class: 'card cal-month-wrap' }, grid));

    // Список выбранного дня (на телефоне — основной способ просмотра)
    var sel = state.date, selItems = byDate[sel] || [];
    root.appendChild(h('section', { class: 'card cal-daypanel', 'aria-labelledby': 'calDayPanelTitle' }, [
      h('div', { class: 'row-between' }, [
        h('h3', { id: 'calDayPanelTitle' }, D.longLabel(sel) + (sel === today ? ' · сегодня' : '')),
        h('div', { class: 'cal-daypanel-actions' }, [
          addBtn(sel, '＋ Задача', 'btn btn-ghost sm'),
          h('button', { type: 'button', class: 'btn btn-ghost sm', onclick: function () { go('day', sel); } }, 'Открыть день')
        ])
      ]),
      selItems.length ? h('ul', { class: 'cal-cards' }, selItems.map(function (it) { return card(it, { prefix: 'p-' }); }))
        : h('p', { class: 'muted' }, 'Нет задач и дедлайнов на этот день.')
    ]));
  }

  /* ---------- Вид «Неделя» ---------- */
  function renderWeek(root, projects) {
    var r = D.range('week', state.date), today = D.todayISO();
    var byDate = groupByDate(collect(projects, r.from, r.to, state.filters));
    var wrap = h('div', { class: 'cal-week', role: 'grid', 'aria-label': 'Неделя: ' + D.title('week', state.date) });
    var row = h('div', { class: 'cal-week-row', role: 'row' });
    D.eachDay(r.from, r.to).forEach(function (day, i) {
      var items = byDate[day] || [], isToday = day === today, isSel = day === state.date;
      row.appendChild(h('section', { class: 'cal-wcol card' + (isToday ? ' is-today' : '') + (isSel ? ' is-selected' : '') + (i > 4 ? ' is-weekend' : ''), role: 'gridcell', 'aria-selected': String(isSel), dataset: { date: day } }, [
        h('header', { class: 'cal-wcol-head' }, [
          h('button', { type: 'button', class: 'cal-wday', tabindex: isSel ? '0' : '-1', 'aria-current': isToday ? 'date' : null,
            'aria-label': D.longLabel(day) + (isToday ? ', сегодня' : '') + ', элементов: ' + items.length + '. Enter — открыть день',
            dataset: { date: day, focusKey: 'day-' + day }, onclick: function () { go('day', day); } }, [
            h('span', { class: 'cal-wday-name' }, D.WEEKDAYS_SHORT[i]),
            h('span', { class: 'cal-wday-num' }, String(+day.slice(8))),
            h('span', { class: 'cal-wday-month' }, D.MONTHS_GEN[+day.slice(5, 7) - 1])
          ]),
          addBtn(day)
        ]),
        h('p', { class: 'cal-allday' }, 'весь день'),
        items.length ? h('ul', { class: 'cal-cards' }, items.map(function (it) { return card(it); })) : h('p', { class: 'cal-empty muted' }, '—')
      ]));
    });
    wrap.appendChild(row);
    wrap.addEventListener('keydown', gridKeys);
    root.appendChild(wrap);
  }

  /* ---------- Вид «День» ---------- */
  function renderDay(root, projects) {
    var day = state.date, today = D.todayISO();
    var items = collect(projects, day, day, state.filters);
    var dl = items.filter(function (i) { return i.kind !== 'task'; }), tasks = items.filter(function (i) { return i.kind === 'task'; });
    function group(id, title, list, opts, emptyText) {
      return h('section', { class: 'card cal-group' + (opts && opts.cls ? ' ' + opts.cls : ''), 'aria-labelledby': id }, [
        h('h3', { id: id }, [title, ' ', h('span', { class: 'count' }, String(list.length))]),
        list.length ? h('ul', { class: 'cal-cards' }, list.map(function (it) { return card(it, opts); })) : h('p', { class: 'muted' }, emptyText)
      ]);
    }
    var box = h('div', { class: 'cal-day' });
    box.appendChild(h('div', { class: 'cal-day-head row-between' }, [
      h('p', { class: 'muted' }, day === today ? 'Сегодня' : U.daysLabel(U.daysUntil(day)).replace(/^осталось/, 'через').replace(/^просрочен на/, 'прошло') ),
      addBtn(day, '＋ Задача на этот день', 'btn btn-ghost sm')
    ]));
    if (day === today) {
      var overdue = collectOverdue(projects, state.filters);
      if (overdue.length) box.appendChild(group('grpOverdue', 'Просрочено', overdue, { cls: 'cal-group-overdue', showDate: true, prefix: 'o-' }));
    }
    if (state.filters.deadlines) box.appendChild(group('grpDeadlines', 'Дедлайны проектов', dl, null, 'Нет дедлайнов и стартов проектов.'));
    box.appendChild(group('grpTasks', 'Задачи', tasks, null, 'Нет задач со сроком на этот день.'));
    root.appendChild(box);
  }

  /* ---------- Клавиатура в сетке ---------- */
  function gridKeys(e) {
    var btn = e.target.closest && e.target.closest('[data-date].cal-daynum, [data-date].cal-wday');
    if (!btn) return;
    var day = btn.dataset.date, next = null;
    switch (e.key) {
      case 'ArrowLeft': next = D.addDays(day, -1); break;
      case 'ArrowRight': next = D.addDays(day, 1); break;
      case 'ArrowUp': if (state.view === 'month') next = D.addDays(day, -7); break;
      case 'ArrowDown': if (state.view === 'month') next = D.addDays(day, 7); break;
      case 'Home': next = D.startOfWeek(day); break;
      case 'End': next = D.endOfWeek(day); break;
      case 'PageUp': next = e.shiftKey ? D.addMonths(day, -12) : D.addMonths(day, -1); break;
      case 'PageDown': next = e.shiftKey ? D.addMonths(day, 12) : D.addMonths(day, 1); break;
      case 'Enter': case ' ':
        if (state.view === 'month') { e.preventDefault(); go('day', day); }
        return;
      default: return;
    }
    if (!next) return;
    e.preventDefault();
    state.date = next;
    render();
    focusDay(next);
  }
  function focusDay(day) {
    var el = document.querySelector('[data-focus-key="day-' + day + '"]');
    if (el) el.focus();
  }

  /* ---------- Отрисовка ---------- */
  function fillProjects() {
    var sel = $('calProject'), cur = state.filters.project;
    var list = S.all().slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'ru'); });
    U.clear(sel).appendChild(h('option', { value: '' }, 'Все проекты'));
    list.forEach(function (p) { sel.appendChild(h('option', { value: p.id, selected: p.id === cur }, p.name)); });
    if (cur && !S.get(cur)) { state.filters.project = ''; sel.value = ''; }
  }

  function syncControls() {
    document.querySelectorAll('[data-cal-view]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.calView === state.view)); });
    var names = { day: 'день', week: 'неделю', month: 'месяц' };
    $('calPrev').setAttribute('aria-label', 'Назад на ' + names[state.view]);
    $('calNext').setAttribute('aria-label', 'Вперёд на ' + names[state.view]);
    var today = D.todayISO(), r = D.range(state.view, state.date);
    var t = $('calToday');
    var inView = state.view === 'month' ? D.sameMonth(today, state.date) : today >= r.from && today <= r.to;
    t.setAttribute('aria-pressed', String(inView));
    $('calStatus').value = state.filters.status;
    $('calDeadlines').checked = !!state.filters.deadlines;
  }

  function renderSummary(projects) {
    var r = D.range(state.view, state.date);
    if (state.view === 'month') r = { from: D.startOfMonth(state.date), to: D.endOfMonth(state.date) };
    var items = collect(projects, r.from, r.to, state.filters);
    var tasks = items.filter(function (i) { return i.kind === 'task'; });
    var open = tasks.filter(function (i) { return !i.done; }).length, over = tasks.filter(function (i) { return i.overdue; }).length;
    var dls = items.filter(function (i) { return i.kind === 'deadline'; }).length;
    var el = $('calSummary');
    el.textContent = 'В периоде: ' + tasks.length + ' ' + U.plural(tasks.length, 'задача', 'задачи', 'задач') +
      ' (открыто ' + open + (over ? ', просрочено ' + over : '') + ')' + (state.filters.deadlines ? ', дедлайнов проектов: ' + dls : '');

    var hint = $('calHint'), n = countUndated(projects, state.filters);
    U.clear(hint);
    hint.hidden = !n;
    if (n) {
      hint.appendChild(document.createTextNode(n + ' ' + U.plural(n, 'задача', 'задачи', 'задач') + ' без срока не ' + U.plural(n, 'показана', 'показаны', 'показаны') + ' в календаре. '));
      hint.appendChild(h('a', { href: state.filters.project ? SH.projectHref(state.filters.project) : 'projects.html' }, 'Назначить срок в проектах →'));
    }
  }

  function persist() {
    SH.lsSet(STATE_KEY, JSON.stringify({ view: state.view, date: state.date, filters: state.filters }));
    var hash = D.buildHash(state.view, state.date);
    if (global.location.hash !== hash) {
      try { global.history.replaceState(null, '', global.location.pathname + global.location.search + hash); } catch (e) { /* noop */ }
    }
  }

  function render() {
    var active = document.activeElement;
    var focusKey = active && active.dataset ? active.dataset.focusKey : null;
    var projects = S.all();
    fillProjects();
    syncControls();
    $('calTitle').textContent = D.title(state.view, state.date);
    var root = U.clear($('calView'));
    root.setAttribute('data-view', state.view);
    if (!projects.length) {
      root.appendChild(h('div', { class: 'empty card' }, [
        h('p', { class: 'empty-title' }, 'Проектов пока нет'),
        h('p', { class: 'muted' }, 'Создайте проект и добавьте задачи со сроком закрытия — они появятся в календаре.'),
        h('div', { class: 'empty-actions' }, [h('a', { class: 'btn btn-primary', href: 'projects.html#new' }, '＋ Новый проект')])
      ]));
    }
    if (state.view === 'month') renderMonth(root, projects);
    else if (state.view === 'week') renderWeek(root, projects);
    else renderDay(root, projects);
    renderSummary(projects);
    persist();
    if (state.openItem) renderItemModal();
    if (focusKey && (!document.activeElement || document.activeElement === document.body || !document.contains(active))) {
      var el = document.querySelector('[data-focus-key="' + focusKey.replace(/["\\]/g, '') + '"]');
      if (el) el.focus();
    }
  }

  /* ---------- Навигация ---------- */
  function go(view, date) {
    if (D.VIEWS.indexOf(view) >= 0) state.view = view;
    if (date && U.isValidDate(date)) state.date = date;
    render();
  }
  function setView(view) { go(view); }
  function prev() { go(state.view, D.shift(state.view, state.date, -1)); }
  function next() { go(state.view, D.shift(state.view, state.date, 1)); }
  function today() { go(state.view, D.todayISO()); }
  /** Выбор дня в сетке месяца: показывает его список под сеткой (день из соседнего месяца переключает месяц). */
  function selectDay(day) { state.date = day; render(); focusDay(day); }

  /* ---------- Действия с задачами ---------- */
  function toggleTask(projectId, taskId, done) {
    var p = S.toggleTask(projectId, taskId, done);
    if (!p) { UI.toast('Проект не найден — возможно, он удалён в другой вкладке', 'error'); render(); return null; }
    var t = S.getTask(projectId, taskId);
    if (t) UI.toast(t.done ? 'Задача выполнена: ' + t.text : 'Задача снова открыта: ' + t.text, t.done ? 'success' : undefined);
    return t;
  }

  /* ---------- Окно элемента ---------- */
  function findItem(ref) {
    var p = S.get(ref.projectId);
    if (!p) return null;
    if (ref.kind === 'task') { var t = S.getTask(p.id, ref.taskId); return t && t.due ? taskItem(p, t) : (t ? Object.assign(taskItem(p, t), { date: '' }) : null); }
    var it = projectItem(p, ref.kind);
    return it.date ? it : null;
  }
  function openItem(item, trigger) {
    state.openItem = { kind: item.kind, projectId: item.project.id, taskId: item.task ? item.task.id : null };
    renderItemModal();
    UI.openModal($('itemModal'), { returnFocus: trigger, onClose: function () { state.openItem = null; } });
  }
  function renderItemModal() {
    var item = findItem(state.openItem);
    if (!item) { UI.closeModal($('itemModal')); state.openItem = null; UI.toast('Элемент больше не существует'); return; }
    var p = item.project, body = U.clear($('itemBody'));
    $('itemTitle').textContent = item.kind === 'task' ? 'Задача' : item.title;
    $('itemProjectLink').setAttribute('href', SH.projectHref(p.id));
    function row(label, value) { return h('div', { class: 'meta-item' }, [h('dt', null, label), h('dd', null, value)]); }
    var badgeCls = item.overdue ? 'badge-danger' : item.done ? 'badge-muted' : item.kind === 'task' ? 'badge-open' : 'badge-warn';
    body.appendChild(h('div', { class: 'cal-item-head', style: colorStyle(p) }, [
      h('span', { class: 'dot cal-dot', 'aria-hidden': 'true' }),
      h('a', { href: SH.projectHref(p.id), class: 'cal-item-project' }, p.name)
    ]));
    if (item.kind === 'task') body.appendChild(h('p', { class: 'cal-item-title' + (item.done ? ' is-done' : '') }, item.title));
    var dl = h('dl', { class: 'meta-grid meta-grid-2' }, [
      row('Статус', h('span', { class: 'badge ' + badgeCls }, statusText(item))),
      row(item.kind === 'task' ? 'Срок закрытия' : 'Дата', item.date ? h('span', null, [U.formatDate(item.date), ' ', h('small', { class: item.overdue ? 'text-danger' : 'muted' }, item.done ? '' : U.daysLabel(U.daysUntil(item.date)))]) : h('span', { class: 'muted' }, 'без срока')),
      row('Статус проекта', UI.statusBadge(p.status)),
      row('Прогресс проекта', p.progress + '%')
    ]);
    body.appendChild(dl);
    if (item.kind === 'task') {
      var t = item.task;
      body.appendChild(h('div', { class: 'cal-item-actions' }, [
        h('label', { class: 'check' }, [
          h('input', { type: 'checkbox', id: 'itemDone', checked: t.done, dataset: { focusKey: 'item-done' }, onchange: function (e) { toggleTask(p.id, t.id, e.target.checked); } }),
          h('span', null, 'Выполнена')
        ]),
        h('label', { class: 'cal-item-due' }, [
          h('span', null, 'Срок'),
          // Сохраняем срок только после завершения ввода (Enter / уход с поля / выбор в пикере), а не на каждый сегмент
          U.onDateCommit(h('input', { type: 'date', id: 'itemDue', value: t.due || '', dataset: { focusKey: 'item-due' } }), function (v) {
            S.setTaskDue(p.id, t.id, v);
            if (v) { UI.toast('Срок изменён: ' + U.formatDate(v)); }
            else UI.toast('Срок убран — задача больше не в календаре');
          })
        ])
      ]));
    } else if (item.kind === 'deadline') {
      body.appendChild(h('p', { class: 'muted' }, 'Начало: ' + U.formatDate(p.start) + ' · Задач: ' + p.tasks.filter(function (x) { return x.done; }).length + '/' + p.tasks.length));
    }
  }

  /* ---------- Новая задача из календаря ---------- */
  function setErr(id, msg) {
    var el = $('err-' + id), input = $(id);
    el.textContent = msg || '';
    if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  }
  function openTaskForm(date, trigger) {
    var list = S.all().slice().sort(function (a, b) {
      var fa = isClosedProject(a), fb = isClosedProject(b);
      if (fa !== fb) return fa ? 1 : -1;
      return a.name.localeCompare(b.name, 'ru');
    });
    var sel = U.clear($('tProject'));
    list.forEach(function (p) { sel.appendChild(h('option', { value: p.id }, p.name + (isClosedProject(p) ? ' (' + S.statusLabel(p.status).toLowerCase() + ')' : ''))); });
    var preferred = state.filters.project && S.get(state.filters.project) ? state.filters.project : (list[0] && list[0].id);
    if (preferred) sel.value = preferred;
    $('taskNoProjects').hidden = !!list.length;
    $('taskSubmit').disabled = !list.length;
    sel.disabled = !list.length;
    $('tText').value = '';
    $('tDue').value = U.isValidDate(date) ? date : state.date;
    ['tProject', 'tText', 'tDue'].forEach(function (k) { setErr(k, ''); });
    UI.openModal($('taskModal'), { returnFocus: trigger || document.activeElement, initialFocus: list.length ? $('tText') : null });
  }
  function submitTaskForm() {
    var pid = $('tProject').value, text = $('tText').value.trim(), due = $('tDue').value, ok = true;
    setErr('tProject', S.get(pid) ? '' : 'Выберите проект'); if (!S.get(pid)) ok = false;
    setErr('tText', text ? (text.length > 200 ? 'Не длиннее 200 символов' : '') : 'Введите текст задачи'); if (!text || text.length > 200) ok = false;
    setErr('tDue', U.isValidDate(due) ? '' : 'Укажите дату'); if (!U.isValidDate(due)) ok = false;
    if (!ok) { var first = document.querySelector('#taskForm [aria-invalid="true"]'); if (first) first.focus(); return false; }
    var res = S.addTask(pid, text, due);
    if (!res) { UI.toast('Не удалось добавить задачу', 'error'); return false; }
    UI.closeModal($('taskModal'), 'saved');
    var hidden = (state.filters.project && state.filters.project !== pid) || state.filters.status === 'done';
    state.date = due;
    render();
    UI.toast('Задача добавлена на ' + U.formatDate(due) + (hidden ? ' (скрыта фильтром)' : ''), 'success');
    return true;
  }

  /* ---------- Состояние ---------- */
  function restore() {
    var saved = null;
    try { saved = JSON.parse(SH.lsGet(STATE_KEY) || 'null'); } catch (e) { saved = null; }
    if (saved && typeof saved === 'object') {
      if (D.VIEWS.indexOf(saved.view) >= 0) state.view = saved.view;
      if (U.isValidDate(saved.date)) state.date = saved.date;
      var f = saved.filters;
      if (f && typeof f === 'object') {
        state.filters.project = typeof f.project === 'string' ? f.project.slice(0, 60) : '';
        state.filters.status = f.status === 'open' || f.status === 'done' ? f.status : '';
        state.filters.deadlines = f.deadlines !== false;
      }
    }
    applyHash();
  }
  function applyHash() {
    var hs = D.parseHash(global.location.hash);
    if (hs.view) state.view = hs.view;
    if (hs.date) state.date = hs.date;
    return !!(hs.view || hs.date);
  }
  function resetFilters() {
    state.filters = { project: '', status: '', deadlines: true };
    render();
  }

  /* ---------- Инициализация ---------- */
  function init() {
    restore();
    document.querySelectorAll('[data-cal-view]').forEach(function (b) { b.addEventListener('click', function () { setView(b.dataset.calView); }); });
    $('calPrev').addEventListener('click', prev);
    $('calNext').addEventListener('click', next);
    $('calToday').addEventListener('click', today);
    $('calProject').addEventListener('change', function (e) { state.filters.project = e.target.value; render(); });
    $('calStatus').addEventListener('change', function (e) { state.filters.status = e.target.value; render(); });
    $('calDeadlines').addEventListener('change', function (e) { state.filters.deadlines = e.target.checked; render(); });
    $('calReset').addEventListener('click', resetFilters);
    $('calFilters').addEventListener('submit', function (e) { e.preventDefault(); });
    $('taskForm').addEventListener('submit', function (e) { e.preventDefault(); submitTaskForm(); });
    document.querySelectorAll('[data-action="new-task"]').forEach(function (b) {
      b.addEventListener('click', function (e) { openTaskForm(state.date, e.currentTarget); });
    });
    global.addEventListener('hashchange', function () { if (applyHash()) render(); });
    SH.init({ render: render });
  }

  PD.calendar = {
    state: state, collect: collect, collectOverdue: collectOverdue, countUndated: countUndated, statusText: statusText,
    render: render, go: go, setView: setView, prev: prev, next: next, today: today, selectDay: selectDay,
    toggleTask: toggleTask, openItem: openItem, openTaskForm: openTaskForm, submitTaskForm: submitTaskForm, resetFilters: resetFilters,
    projectHue: projectHue
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
