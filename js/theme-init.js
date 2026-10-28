/* Применяет сохранённую тему до отрисовки страницы, чтобы не было «мигания». */
(function () {
  'use strict';
  var theme = null;
  try { theme = localStorage.getItem('itpd.theme'); } catch (e) { /* localStorage недоступен */ }
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', theme);
})();
