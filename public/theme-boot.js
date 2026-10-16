// Тема до первой отрисовки, чтобы не мигало: выбор пользователя → настройка системы. ?theme= — для скриншотов.
// Отдельным файлом, а не встроенным скриптом: строгая CSP (аудит M6) запрещает встроенные скрипты.
(function () {
  var t = new URLSearchParams(location.search).get('theme');
  try { t = t || localStorage.getItem('sverka.theme'); } catch (e) {}
  if (t !== 'dark' && t !== 'light') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
  // Цвет полосы браузера — по теме с первой отрисовки (п. 60; дальше его меняет lib/theme.ts). = META_COLOR.
  var m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', t === 'dark' ? '#07090C' : '#ECEEF1');
})();
