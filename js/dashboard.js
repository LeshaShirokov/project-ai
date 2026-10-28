/* Страница «Аналитика»: KPI и графики по всем проектам */
(function (global) {
  'use strict';
  var PD = global.PD = global.PD || {};
  var U = PD.utils, S = PD.store, UI = PD.ui, C = PD.charts;
  var h = U.h, progressBar = UI.progressBar;

  function $(id) { return document.getElementById(id); }

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
      { key: 'progress', label: 'Средний прогресс', value: st.avgProgress + '%', ico: '↗', bar: st.avgProgress },
      { key: 'team', label: 'Участников в команде', value: String(st.team), ico: '☺', sub: 'заняты в проектах: ' + st.teamBusy, href: 'contacts.html' }
    ];
    items.forEach(function (k) {
      root.appendChild(h('li', { class: 'card kpi kpi-' + k.key + (k.danger ? ' is-danger' : ''), dataset: { kpi: k.key } }, [
        h('span', { class: 'kpi-ico', 'aria-hidden': 'true' }, k.ico),
        k.href ? h('a', { class: 'kpi-label kpi-link', href: k.href }, k.label) : h('span', { class: 'kpi-label' }, k.label),
        h('strong', { class: 'kpi-value', title: k.title || null }, k.value),
        k.sub ? h('span', { class: 'kpi-sub' }, k.sub) : null,
        k.bar !== undefined ? progressBar(k.bar, k.label) : null
      ]));
    });
  }

  function render() {
    var list = S.all();
    var st = S.stats(), busy = {};
    var team = PD.contacts.team();
    list.forEach(function (p) { p.teamIds.forEach(function (id) { busy[id] = true; }); });
    st.team = team.length;
    st.teamBusy = team.filter(function (c) { return busy[c.id]; }).length;
    renderKPIs($('kpis'), st);
    C.donut($('chartStatus'), list);
    C.budgetBars($('chartBudget'), list);
    C.techBars($('chartTech'), list);
    C.deadlines($('chartDeadlines'), list, function (p) { return PD.shell.projectHref(p.id); });
  }

  PD.dashboard = { render: render };

  function init() { PD.shell.init({ render: render }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
