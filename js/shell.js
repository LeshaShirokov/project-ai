/* Общий каркас страниц: тема, дата, мобильное меню, синхронизация между вкладками */
(function (global) {
  'use strict';
  var PD = global.PD = global.PD || {};
  var U = PD.utils, S = PD.store, UI = PD.ui;

  var THEME_KEY = 'itpd.theme';

  function $(id) { return document.getElementById(id); }
  function lsGet(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { global.localStorage.setItem(k, v); } catch (e) { /* noop */ } }

  /* ---------- Тема ---------- */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    var btn = $('themeBtn');
    if (!btn) return;
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

  /**
   * Инициализация страницы.
   * opts.render(reason) — перерисовка при изменении данных;
   * opts.onStorage(event) — дополнительные ключи localStorage (для синхронизации вкладок).
   */
  function init(opts) {
    opts = opts || {};
    UI.initModals();
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

    var today = U.today(), label = $('todayLabel');
    if (label) {
      try { label.textContent = 'Сегодня: ' + today.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
      catch (e) { label.textContent = 'Сегодня: ' + U.formatDate(U.toISODate(today)); }
    }

    $('themeBtn').addEventListener('click', toggleTheme);
    $('menuBtn').addEventListener('click', function () { setMenu(!$('sidebar').classList.contains('is-open')); });
    $('sidebarBackdrop').addEventListener('click', function () { setMenu(false); });
    document.querySelectorAll('.nav-link, .sidebar [data-action]').forEach(function (a) {
      a.addEventListener('click', function () { setMenu(false); });
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && $('sidebar').classList.contains('is-open')) setMenu(false); });

    // Синхронизация между вкладками и страницами
    global.addEventListener('storage', function (e) {
      if (e.key === S.STORAGE_KEY || e.key === null) S.reload();
      else if (e.key === THEME_KEY && (e.newValue === 'dark' || e.newValue === 'light')) applyTheme(e.newValue);
      else if (opts.onStorage) opts.onStorage(e);
    });

    S.subscribe(function (reason) {
      if (opts.render) opts.render(reason);
      if (reason === 'sync') UI.toast('Данные обновлены в другой вкладке');
    });
    S.load();
    if (!S.storageOk()) UI.toast('localStorage недоступен — данные не сохранятся', 'error');
  }

  /** Ссылка на проект на странице «Проекты» (относительная — работает и под /project-ai/). */
  function projectHref(id) { return 'projects.html#project=' + encodeURIComponent(id); }

  PD.shell = { init: init, applyTheme: applyTheme, toggleTheme: toggleTheme, lsGet: lsGet, lsSet: lsSet, projectHref: projectHref };
})(window);
