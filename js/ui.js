/* Компоненты интерфейса: модальные окна, уведомления, таблица, канбан, KPI, карточка проекта */
(function (global) {
  'use strict';
  var PD = global.PD = global.PD || {};
  var U = PD.utils, S = PD.store;
  var h = U.h;

  /* ---------- Модальные окна ---------- */
  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  var stack = [];

  function visibleFocusables(root) {
    return Array.prototype.filter.call(root.querySelectorAll(FOCUSABLE), function (el) { return !el.hidden && !el.closest('[hidden]'); });
  }

  function openModal(modal, opts) {
    opts = opts || {};
    if (stack.some(function (m) { return m.el === modal; })) return;
    var entry = { el: modal, returnFocus: opts.returnFocus || document.activeElement, onClose: opts.onClose };
    stack.push(entry);
    modal.hidden = false;
    document.body.classList.add('modal-open');
    var app = document.getElementById('app');
    if (app) { app.setAttribute('aria-hidden', 'true'); app.inert = true; }
    var first = opts.initialFocus || visibleFocusables(modal.querySelector('.modal-dialog'))[0];
    if (first) setTimeout(function () { try { first.focus(); } catch (e) { /* noop */ } }, 0);
  }

  function closeModal(modal, reason) {
    var idx = -1;
    stack.forEach(function (m, i) { if (m.el === modal) idx = i; });
    if (idx < 0) return;
    var entry = stack.splice(idx, 1)[0];
    modal.hidden = true;
    if (!stack.length) {
      document.body.classList.remove('modal-open');
      var app = document.getElementById('app');
      if (app) { app.removeAttribute('aria-hidden'); app.inert = false; }
    }
    if (entry.onClose) entry.onClose(reason);
    var rf = entry.returnFocus;
    if (rf && rf.focus && document.contains(rf)) { try { rf.focus(); } catch (e) { /* noop */ } }
  }

  function isOpen(modal) { return !modal.hidden; }

  function initModals() {
    document.addEventListener('click', function (e) {
      var closer = e.target.closest && e.target.closest('[data-close]');
      if (!closer) return;
      var modal = closer.closest('.modal');
      if (modal) closeModal(modal, 'cancel');
    });
    document.addEventListener('keydown', function (e) {
      if (!stack.length) return;
      var top = stack[stack.length - 1].el;
      if (e.key === 'Escape') { e.preventDefault(); closeModal(top, 'cancel'); return; }
      if (e.key === 'Tab') {
        var f = visibleFocusables(top.querySelector('.modal-dialog'));
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  /** Подтверждение действия. Возвращает Promise<boolean>. */
  function confirmDialog(text, okLabel) {
    var modal = document.getElementById('confirmModal');
    var ok = document.getElementById('confirmOk');
    document.getElementById('confirmText').textContent = text;
    ok.textContent = okLabel || 'Подтвердить';
    return new Promise(function (resolve) {
      var done = false;
      function onOk() { done = true; closeModal(modal, 'ok'); }
      ok.addEventListener('click', onOk);
      openModal(modal, {
        initialFocus: document.getElementById('confirmCancel'),
        onClose: function () { ok.removeEventListener('click', onOk); resolve(done); }
      });
    });
  }

  /* ---------- Уведомления ---------- */
  function toast(text, type) {
    var box = document.getElementById('toasts');
    if (!box) return;
    var t = h('div', { class: 'toast' + (type ? ' toast-' + type : '') }, text);
    box.appendChild(t);
    setTimeout(function () { t.classList.add('is-hiding'); }, 3200);
    setTimeout(function () { t.remove(); }, 3600);
  }

  /* ---------- Мелкие элементы ---------- */
  function statusBadge(status) {
    var st = S.statusById(status);
    return h('span', { class: 'badge status-badge status-' + status }, [
      h('span', { class: 'dot', style: 'background:' + (st ? st.color : '#999'), 'aria-hidden': 'true' }), S.statusLabel(status)
    ]);
  }
  function priorityBadge(priority) {
    return h('span', { class: 'badge prio prio-' + priority, title: 'Приоритет' }, S.priorityLabel(priority));
  }
  function progressBar(value, label) {
    return h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(value), 'aria-label': label || 'Прогресс' }, [
      h('div', { class: 'progress-fill' + (value >= 100 ? ' is-full' : ''), style: 'width:' + value + '%' })
    ]);
  }
  function chips(list, cls) {
    if (!list || !list.length) return h('span', { class: 'muted' }, '—');
    return h('span', { class: 'chips' }, list.map(function (t) { return h('span', { class: 'chip ' + (cls || '') }, t); }));
  }
  function deadlineCell(p) {
    if (!p.deadline) return h('span', { class: 'muted' }, '—');
    var d = U.daysUntil(p.deadline);
    var finished = p.status === 'done' || p.status === 'cancelled';
    var cls = finished ? 'muted' : d < 0 ? 'text-danger' : d <= 7 ? 'text-warn' : 'muted';
    return h('span', { class: 'deadline-cell' }, [
      h('span', null, U.formatDate(p.deadline)),
      h('small', { class: cls }, finished ? (p.status === 'done' ? 'завершён' : 'отменён') : U.daysLabel(d))
    ]);
  }
  function statusSelect(p, onChange) {
    return h('select', {
      class: 'status-select', 'aria-label': 'Статус проекта «' + p.name + '»', dataset: { focusKey: 'status-' + p.id },
      onchange: function (e) { onChange(p.id, e.target.value); }
    }, S.STATUSES.map(function (st) { return h('option', { value: st.id, selected: st.id === p.status }, st.label); }));
  }

  function initials(name) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join('') || '?';
  }
  function hue(str) { var x = 0; for (var i = 0; i < str.length; i++) x = (x * 31 + str.charCodeAt(i)) % 360; return x; }
  /** Аватары команды (инициалы); полный список — в подсказке и для скринридеров. */
  function avatars(team) {
    if (!team || !team.length) return h('span', { class: 'muted' }, '—');
    var shown = team.slice(0, 3);
    return h('span', { class: 'avatars', title: team.join(', ') }, [
      h('span', { class: 'sr-only' }, team.join(', ')),
      shown.map(function (n) { return h('span', { class: 'avatar', 'aria-hidden': 'true', style: 'background:hsl(' + hue(n) + ' 65% 55%)' }, initials(n)); }),
      team.length > 3 ? h('span', { class: 'avatar avatar-more', 'aria-hidden': 'true' }, '+' + (team.length - 3)) : null
    ]);
  }

  /* ---------- KPI ---------- */
  function renderKPIs(root, st) {
    U.clear(root);
    var items = [
      { key: 'total', label: 'Всего проектов', value: String(st.total), ico: '▦' },
      { key: 'active', label: 'В работе', value: String(st.active), ico: '▶' },
      { key: 'done', label: 'Завершено', value: String(st.done), ico: '✓' },
      { key: 'overdue', label: 'Просрочено', value: String(st.overdue), ico: '!', danger: st.overdue > 0 },
      { key: 'budget', label: 'Общий бюджет', value: U.moneyShort(st.budget), title: U.money(st.budget), ico: '₽' },
      { key: 'spent', label: 'Потрачено', value: U.moneyShort(st.spent), title: U.money(st.spent), ico: '◒', sub: st.spentPct + '% бюджета', bar: Math.min(100, st.spentPct), danger: st.spentPct > 100 },
      { key: 'progress', label: 'Средний прогресс', value: st.avgProgress + '%', ico: '↗', bar: st.avgProgress }
    ];
    items.forEach(function (k) {
      root.appendChild(h('li', { class: 'card kpi kpi-' + k.key + (k.danger ? ' is-danger' : ''), dataset: { kpi: k.key } }, [
        h('span', { class: 'kpi-ico', 'aria-hidden': 'true' }, k.ico),
        h('span', { class: 'kpi-label' }, k.label),
        h('strong', { class: 'kpi-value', title: k.title || null }, k.value),
        k.sub ? h('span', { class: 'kpi-sub' }, k.sub) : null,
        k.bar !== undefined ? progressBar(k.bar, k.label) : null
      ]));
    });
  }

  /* ---------- Таблица ---------- */
  function renderTable(root, list, handlers) {
    U.clear(root);
    if (!list.length) { root.appendChild(emptyState(handlers)); return; }
    var cols = ['Проект', 'Статус', 'Приоритет', 'Стек', 'Команда', 'Дедлайн', 'Бюджет', 'Прогресс', 'Действия'];
    var table = h('table', { class: 'table' }, [
      h('caption', { class: 'sr-only' }, 'Список проектов'),
      h('thead', null, h('tr', null, cols.map(function (c) { return h('th', { scope: 'col' }, c); }))),
      h('tbody', null, list.map(function (p) {
        var overdue = S.isOverdue(p);
        var doneTasks = p.tasks.filter(function (t) { return t.done; }).length;
        return h('tr', { class: overdue ? 'is-overdue' : '', dataset: { id: p.id } }, [
          h('td', { 'data-label': 'Проект', class: 'cell-name' }, [
            h('button', { type: 'button', class: 'link-btn project-name', onclick: function () { handlers.open(p.id); } }, p.name),
            p.client ? h('small', { class: 'muted block' }, p.client) : null,
            p.tasks.length ? h('small', { class: 'muted block' }, 'Задачи: ' + doneTasks + '/' + p.tasks.length) : null
          ]),
          h('td', { 'data-label': 'Статус' }, statusBadge(p.status)),
          h('td', { 'data-label': 'Приоритет' }, priorityBadge(p.priority)),
          h('td', { 'data-label': 'Стек', class: 'cell-stack' }, [chips(p.stack.slice(0, 2)), p.stack.length > 2 ? h('small', { class: 'muted more', title: p.stack.join(', ') }, '+' + (p.stack.length - 2)) : null]),
          h('td', { 'data-label': 'Команда', class: 'cell-team' }, avatars(p.team)),
          h('td', { 'data-label': 'Дедлайн' }, deadlineCell(p)),
          h('td', { 'data-label': 'Бюджет', class: 'cell-money' }, [
            h('span', null, U.moneyShort(p.budget)),
            h('small', { class: p.spent > p.budget ? 'text-danger block' : 'muted block' }, 'потрачено ' + U.moneyShort(p.spent))
          ]),
          h('td', { 'data-label': 'Прогресс', class: 'cell-progress' }, [progressBar(p.progress, 'Прогресс «' + p.name + '»'), h('small', null, p.progress + '%')]),
          h('td', { 'data-label': 'Действия', class: 'cell-actions' }, [
            h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Изменить «' + p.name + '»', title: 'Изменить', dataset: { act: 'edit' }, onclick: function (e) { handlers.edit(p.id, e.currentTarget); } }, '✎'),
            h('button', { type: 'button', class: 'icon-btn sm danger', 'aria-label': 'Удалить «' + p.name + '»', title: 'Удалить', dataset: { act: 'delete' }, onclick: function () { handlers.remove(p.id); } }, '🗑')
          ])
        ]);
      }))
    ]);
    root.appendChild(h('div', { class: 'table-wrap card' }, table));
  }

  function emptyState(handlers) {
    return h('div', { class: 'empty card' }, [
      h('p', { class: 'empty-title' }, 'Проекты не найдены'),
      h('p', { class: 'muted' }, 'Измените фильтры, создайте новый проект или загрузите демо-данные.'),
      h('div', { class: 'empty-actions' }, [
        h('button', { type: 'button', class: 'btn btn-primary', onclick: function (e) { handlers.create(e.currentTarget); } }, '＋ Новый проект'),
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: handlers.resetFilters }, 'Сбросить фильтры')
      ])
    ]);
  }

  /* ---------- Канбан ---------- */
  function renderKanban(root, list, handlers) {
    U.clear(root);
    var board = h('div', { class: 'kanban', role: 'list', 'aria-label': 'Канбан-доска по статусам' });
    S.STATUSES.forEach(function (st) {
      var items = list.filter(function (p) { return p.status === st.id; });
      var colList = h('ul', { class: 'kanban-list', dataset: { status: st.id }, 'aria-label': st.label });
      items.forEach(function (p) { colList.appendChild(kanbanCard(p, handlers)); });
      if (!items.length) colList.appendChild(h('li', { class: 'kanban-empty', 'aria-hidden': 'true' }, 'Перетащите сюда'));
      var col = h('section', { class: 'kanban-col', role: 'listitem', dataset: { status: st.id }, 'aria-label': st.label + ', проектов: ' + items.length }, [
        h('header', { class: 'kanban-head' }, [
          h('span', { class: 'dot', style: 'background:' + st.color, 'aria-hidden': 'true' }),
          h('h3', null, st.label),
          h('span', { class: 'count' }, String(items.length))
        ]),
        colList
      ]);
      col.addEventListener('dragover', function (e) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; col.classList.add('is-over'); });
      col.addEventListener('dragleave', function (e) { if (!col.contains(e.relatedTarget)) col.classList.remove('is-over'); });
      col.addEventListener('drop', function (e) {
        e.preventDefault();
        col.classList.remove('is-over');
        var id = e.dataTransfer ? e.dataTransfer.getData('text/plain') : '';
        if (id) handlers.setStatus(id, st.id);
      });
      board.appendChild(col);
    });
    root.appendChild(board);
    root.appendChild(h('p', { class: 'hint kanban-hint' }, 'Перетаскивайте карточки между колонками или меняйте статус через список на карточке (доступно с клавиатуры).'));
  }

  function kanbanCard(p, handlers) {
    var overdue = S.isOverdue(p);
    var card = h('li', { class: 'kanban-card card' + (overdue ? ' is-overdue' : ''), draggable: 'true', dataset: { id: p.id } }, [
      h('div', { class: 'kc-top' }, [priorityBadge(p.priority), overdue ? h('span', { class: 'badge badge-danger' }, 'просрочен') : null]),
      h('button', { type: 'button', class: 'link-btn kc-title', onclick: function () { handlers.open(p.id); } }, p.name),
      p.client ? h('p', { class: 'kc-client muted' }, p.client) : null,
      p.stack.length ? chips(p.stack.slice(0, 4)) : null,
      h('div', { class: 'kc-progress' }, [progressBar(p.progress, 'Прогресс «' + p.name + '»'), h('small', null, p.progress + '%')]),
      h('div', { class: 'kc-meta' }, [deadlineCell(p), p.tasks.length ? h('small', { class: 'muted' }, '☑ ' + p.tasks.filter(function (t) { return t.done; }).length + '/' + p.tasks.length) : null]),
      h('div', { class: 'kc-foot' }, [
        statusSelect(p, handlers.setStatus),
        h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Изменить «' + p.name + '»', onclick: function (e) { handlers.edit(p.id, e.currentTarget); } }, '✎')
      ])
    ]);
    card.addEventListener('dragstart', function (e) {
      if (e.dataTransfer) { e.dataTransfer.setData('text/plain', p.id); e.dataTransfer.effectAllowed = 'move'; }
      card.classList.add('is-dragging');
    });
    card.addEventListener('dragend', function () { card.classList.remove('is-dragging'); });
    return card;
  }

  /* ---------- Карточка проекта (детали + задачи) ---------- */
  function renderDetails(root, p, handlers) {
    U.clear(root);
    var doneCount = p.tasks.filter(function (t) { return t.done; }).length;
    function meta(label, value) { return h('div', { class: 'meta-item' }, [h('dt', null, label), h('dd', null, value)]); }
    var repo = p.repo && U.isHttpUrl(p.repo)
      ? h('a', { href: p.repo, target: '_blank', rel: 'noopener noreferrer nofollow', class: 'repo-link' }, p.repo)
      : h('span', { class: 'muted' }, '—');

    root.appendChild(h('div', { class: 'details-badges' }, [statusBadge(p.status), priorityBadge(p.priority), S.isOverdue(p) ? h('span', { class: 'badge badge-danger' }, 'просрочен') : null]));
    if (p.description) root.appendChild(h('p', { class: 'details-desc' }, p.description));
    root.appendChild(h('dl', { class: 'meta-grid' }, [
      meta('Клиент / владелец', p.client || '—'),
      meta('Команда', p.team.length ? p.team.join(', ') : '—'),
      meta('Стек', chips(p.stack)),
      meta('Теги', chips(p.tags, 'chip-tag')),
      meta('Начало', U.formatDate(p.start)),
      meta('Дедлайн', deadlineCell(p)),
      meta('Бюджет', U.money(p.budget)),
      meta('Потрачено', h('span', { class: p.spent > p.budget ? 'text-danger' : '' }, U.money(p.spent) + (p.budget ? ' (' + Math.round(p.spent / p.budget * 100) + '%)' : ''))),
      meta('Репозиторий', repo)
    ]));
    root.appendChild(h('div', { class: 'details-progress' }, [
      h('div', { class: 'row-between' }, [h('strong', null, 'Прогресс'), h('span', { class: 'details-progress-value' }, p.progress + '%')]),
      progressBar(p.progress, 'Прогресс проекта')
    ]));

    var input = h('input', { type: 'text', id: 'taskInput', maxlength: '200', placeholder: 'Новая задача…', 'aria-label': 'Текст новой задачи', autocomplete: 'off' });
    var form = h('form', { class: 'task-add', onsubmit: function (e) {
      e.preventDefault();
      var v = input.value.trim();
      if (!v) { input.focus(); return; }
      handlers.addTask(p.id, v);
    } }, [input, h('button', { type: 'submit', class: 'btn btn-primary sm' }, 'Добавить')]);

    root.appendChild(h('section', { class: 'tasks', 'aria-labelledby': 'tasksTitle' }, [
      h('div', { class: 'row-between' }, [
        h('h3', { id: 'tasksTitle' }, 'Задачи ' + (p.tasks.length ? doneCount + '/' + p.tasks.length : '')),
        h('label', { class: 'check' }, [
          h('input', { type: 'checkbox', id: 'detailsAuto', checked: p.autoProgress, onchange: function (e) { handlers.setAuto(p.id, e.target.checked); } }),
          h('span', null, 'Считать прогресс по задачам')
        ])
      ]),
      p.tasks.length ? h('ul', { class: 'task-list' }, p.tasks.map(function (t) {
        var cbId = 'task-' + t.id;
        return h('li', { class: 'task' + (t.done ? ' is-done' : ''), dataset: { taskId: t.id } }, [
          h('input', { type: 'checkbox', id: cbId, checked: t.done, dataset: { focusKey: 'task-' + t.id }, onchange: function (e) { handlers.toggleTask(p.id, t.id, e.target.checked); } }),
          h('label', { for: cbId }, t.text),
          h('button', { type: 'button', class: 'icon-btn sm danger', 'aria-label': 'Удалить задачу «' + t.text + '»', onclick: function () { handlers.removeTask(p.id, t.id); } }, '✕')
        ]);
      })) : h('p', { class: 'muted' }, 'Задач пока нет.'),
      form
    ]));
  }

  PD.ui = {
    openModal: openModal, closeModal: closeModal, isOpen: isOpen, initModals: initModals, confirm: confirmDialog, toast: toast,
    renderKPIs: renderKPIs, renderTable: renderTable, renderKanban: renderKanban, renderDetails: renderDetails,
    statusBadge: statusBadge, priorityBadge: priorityBadge
  };
})(window);
