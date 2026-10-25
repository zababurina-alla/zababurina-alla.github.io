// Тема до первой отрисовки, чтобы не мигало: выбор пользователя → настройка системы. ?theme= — для скриншотов.
// Отдельным файлом, а не встроенным скриптом: строгая CSP (аудит M6) запрещает встроенные скрипты.
(function () {
  var q = new URLSearchParams(location.search);
  var t = q.get('theme');
  try { t = t || localStorage.getItem('sverka.theme'); } catch (e) {}
  if (t !== 'dark' && t !== 'light') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
  // Пробный вид A «Тихий премиум» (DESIGN.md, 25.10): ?look=a — включить и запомнить, ?look=old — назад.
  // По умолчанию выключен везде, и в учебном режиме тоже: мама его не увидит.
  var look = q.get('look');
  try {
    if (look === 'a') localStorage.setItem('bk.look', 'a');
    else if (look === 'old') localStorage.removeItem('bk.look');
    else look = localStorage.getItem('bk.look');
  } catch (e) {}
  if (look === 'a') document.documentElement.dataset.look = 'a';
  // Цвет полосы браузера — по теме с первой отрисовки (п. 60; дальше его меняет lib/theme.ts). = META_COLOR.
  var m = document.querySelector('meta[name="theme-color"]');
  var meta = look === 'a' ? { dark: '#1C1A17', light: '#F4EFE6' } : { dark: '#07090C', light: '#ECEEF1' };
  if (m) m.setAttribute('content', meta[t]);
})();
