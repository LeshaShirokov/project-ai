/* Графики на чистом SVG — без сторонних библиотек */
(function (global) {
  'use strict';
  var PD = global.PD = global.PD || {};
  var U = PD.utils, S = PD.store;
  var h = U.h, s = U.s;

  function empty(text) { return h('p', { class: 'chart-empty' }, text || 'Нет данных для отображения'); }

  /** Кольцевая диаграмма «Проекты по статусам». */
  function donut(container, projects) {
    U.clear(container);
    var counts = S.STATUSES.map(function (st) {
      return { st: st, n: projects.filter(function (p) { return p.status === st.id; }).length };
    });
    var total = projects.length;
    if (!total) { container.appendChild(empty()); return; }
    var R = 60, C = 2 * Math.PI * R, offset = 0;
    var svg = s('svg', { viewBox: '0 0 160 160', class: 'donut', role: 'img', 'aria-label': 'Проекты по статусам: ' + counts.filter(function (c) { return c.n; }).map(function (c) { return c.st.label + ' — ' + c.n; }).join(', ') });
    svg.appendChild(s('circle', { cx: 80, cy: 80, r: R, fill: 'none', class: 'donut-track', 'stroke-width': 22 }));
    counts.forEach(function (c) {
      if (!c.n) return;
      var len = c.n / total * C;
      var seg = s('circle', {
        cx: 80, cy: 80, r: R, fill: 'none', stroke: c.st.color, 'stroke-width': 22,
        'stroke-dasharray': len + ' ' + (C - len), 'stroke-dashoffset': -offset, transform: 'rotate(-90 80 80)', class: 'donut-seg'
      });
      seg.appendChild(s('title', { text: c.st.label + ': ' + c.n }));
      svg.appendChild(seg);
      offset += len;
    });
    svg.appendChild(s('text', { x: 80, y: 78, 'text-anchor': 'middle', class: 'donut-total', text: total }));
    svg.appendChild(s('text', { x: 80, y: 98, 'text-anchor': 'middle', class: 'donut-caption', text: U.plural(total, 'проект', 'проекта', 'проектов') }));
    var legend = h('ul', { class: 'legend' }, counts.map(function (c) {
      return h('li', { class: c.n ? '' : 'is-zero' }, [
        h('span', { class: 'legend-dot', style: 'background:' + c.st.color, 'aria-hidden': 'true' }),
        h('span', { class: 'legend-label' }, c.st.label),
        h('span', { class: 'legend-value' }, String(c.n))
      ]);
    }));
    container.appendChild(h('div', { class: 'donut-wrap' }, [svg, legend]));
  }

  /** Горизонтальные столбцы «Бюджет vs потрачено» по каждому проекту. */
  function budgetBars(container, projects) {
    U.clear(container);
    var list = projects.filter(function (p) { return p.budget > 0 || p.spent > 0; })
      .sort(function (a, b) { return b.budget - a.budget; }).slice(0, 12);
    if (!list.length) { container.appendChild(empty()); return; }
    var max = Math.max.apply(null, list.map(function (p) { return Math.max(p.budget, p.spent); })) || 1;
    var rows = h('div', { class: 'budget-rows', role: 'list' });
    list.forEach(function (p) {
      var over = p.spent > p.budget;
      var bw = p.budget / max * 100, sw = p.spent / max * 100;
      var pct = p.budget ? Math.round(p.spent / p.budget * 100) : 0;
      var bar = s('svg', { viewBox: '0 0 100 18', preserveAspectRatio: 'none', class: 'budget-bar', 'aria-hidden': 'true' }, [
        s('rect', { x: 0, y: 0, width: 100, height: 18, rx: 3, class: 'bar-bg' }),
        s('rect', { x: 0, y: 0, width: bw, height: 18, rx: 3, class: 'bar-budget' }),
        s('rect', { x: 0, y: 5, width: sw, height: 8, rx: 2, class: over ? 'bar-spent is-over' : 'bar-spent' })
      ]);
      rows.appendChild(h('div', { class: 'budget-row' + (over ? ' is-over' : ''), role: 'listitem',
        'aria-label': p.name + ': бюджет ' + U.money(p.budget) + ', потрачено ' + U.money(p.spent) + ' (' + pct + '%)' }, [
        h('div', { class: 'budget-row-head' }, [
          h('span', { class: 'budget-name', title: p.name }, p.name),
          h('span', { class: 'budget-nums' }, U.moneyShort(p.spent) + ' / ' + U.moneyShort(p.budget) + ' · ' + pct + '%')
        ]),
        bar
      ]));
    });
    container.appendChild(rows);
    container.appendChild(h('div', { class: 'chart-key', 'aria-hidden': 'true' }, [
      h('span', null, [h('i', { class: 'key key-budget' }), 'Бюджет']),
      h('span', null, [h('i', { class: 'key key-spent' }), 'Потрачено']),
      h('span', null, [h('i', { class: 'key key-over' }), 'Перерасход'])
    ]));
  }

  /** Использование технологий (горизонтальные столбцы в одном SVG). */
  function techBars(container, projects) {
    U.clear(container);
    var map = {};
    projects.forEach(function (p) { p.stack.forEach(function (t) { var k = t.toLowerCase(); map[k] = map[k] || { name: t, n: 0 }; map[k].n++; }); });
    var list = Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.n - a.n || a.name.localeCompare(b.name, 'ru'); }).slice(0, 10);
    if (!list.length) { container.appendChild(empty()); return; }
    var max = list[0].n, rowH = 28, labelW = 110, barW = 260, W = labelW + barW + 34, H = list.length * rowH;
    var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'tech-svg', role: 'img',
      'aria-label': 'Использование технологий: ' + list.map(function (t) { return t.name + ' — ' + t.n; }).join(', ') });
    list.forEach(function (t, i) {
      var y = i * rowH, w = Math.max(2, t.n / max * barW);
      var name = t.name.length > 16 ? t.name.slice(0, 15) + '…' : t.name;
      svg.appendChild(s('text', { x: labelW - 8, y: y + rowH / 2 + 4, 'text-anchor': 'end', class: 'tech-label', text: name }));
      var r = s('rect', { x: labelW, y: y + 6, width: w, height: rowH - 12, rx: 4, class: 'tech-bar', style: 'animation-delay:' + (i * 40) + 'ms' });
      r.appendChild(s('title', { text: t.name + ': ' + t.n }));
      svg.appendChild(r);
      svg.appendChild(s('text', { x: labelW + w + 6, y: y + rowH / 2 + 4, class: 'tech-value', text: t.n }));
    });
    container.appendChild(svg);
  }

  /** Ближайшие дедлайны (с подсветкой просроченных). */
  function deadlines(container, projects, onOpen) {
    U.clear(container);
    var list = projects.filter(function (p) { return p.deadline && p.status !== 'done' && p.status !== 'cancelled'; })
      .sort(function (a, b) { return a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0; }).slice(0, 8);
    if (!list.length) { container.appendChild(empty('Нет активных дедлайнов')); return; }
    container.appendChild(h('ul', { class: 'deadline-list' }, list.map(function (p) {
      var d = U.daysUntil(p.deadline);
      var cls = d < 0 ? 'is-overdue' : d <= 7 ? 'is-soon' : '';
      return h('li', { class: 'deadline-item ' + cls }, [
        h('button', { type: 'button', class: 'link-btn deadline-name', onclick: function () { onOpen && onOpen(p.id); } }, p.name),
        h('span', { class: 'deadline-date' }, U.formatDate(p.deadline)),
        h('span', { class: 'deadline-left badge ' + (d < 0 ? 'badge-danger' : d <= 7 ? 'badge-warn' : 'badge-muted') }, U.daysLabel(d))
      ]);
    })));
  }

  PD.charts = { donut: donut, budgetBars: budgetBars, techBars: techBars, deadlines: deadlines };
})(window);
