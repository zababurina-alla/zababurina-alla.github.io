// Пробный вид A «Тихий премиум» (DESIGN.md, 25.10.2026). Включает его public/theme-boot.js до первой отрисовки:
// ?look=a — включить и запомнить в этом браузере, ?look=old — назад. По умолчанию — прежний вид, и в учебном режиме тоже.
// За время жизни страницы вид не меняется: смена — только перезагрузкой со ссылкой.

/** Включён ли вид A на этой странице. */
export function isLookA(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.look === 'a';
}
