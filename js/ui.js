/* Общие компоненты интерфейса: модальные окна, подтверждение, уведомления, бейджи */
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
  /* ---------- Аватары ---------- */
  function initials(name) {
    return String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join('') || '?';
  }
  function hue(str) { str = String(str || ''); var x = 0; for (var i = 0; i < str.length; i++) x = (x * 31 + str.charCodeAt(i)) % 360; return x; }
  /**
   * Аватар человека: фото (data URL, проверенный хранилищем) или инициалы на цветном фоне.
   * person: {name, photo?, missing?}; opts.size: '' | 'md' | 'lg' | 'xl'; opts.decorative — скрыть от скринридеров.
   */
  function avatar(person, opts) {
    opts = opts || {};
    var name = person && person.name || '';
    var cls = 'avatar' + (opts.size ? ' avatar-' + opts.size : '') + (person && person.missing ? ' avatar-missing' : '');
    var a11y = opts.decorative !== false ? { 'aria-hidden': 'true' } : { role: 'img', 'aria-label': name };
    if (person && person.photo && PD.contacts && PD.contacts.isValidPhoto(person.photo)) {
      return h('span', Object.assign({ class: cls + ' has-photo' }, a11y), h('img', { src: person.photo, alt: '', loading: 'lazy', decoding: 'async' }));
    }
    var style = person && person.missing ? null : 'background:hsl(' + hue(name) + ' 65% 45%)';
    return h('span', Object.assign({ class: cls, style: style }, a11y), person && person.missing ? '?' : initials(name));
  }

  PD.ui = {
    initials: initials, hue: hue, avatar: avatar,
    openModal: openModal, closeModal: closeModal, initModals: initModals, confirm: confirmDialog, toast: toast,
    statusBadge: statusBadge, priorityBadge: priorityBadge, progressBar: progressBar, chips: chips, deadlineCell: deadlineCell
  };
})(window);
