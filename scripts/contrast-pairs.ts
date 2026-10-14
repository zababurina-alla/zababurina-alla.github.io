import type { Pair } from './contrast-lib.ts';

// Все сочетания «цвет текста → фон», которые встречаются в интерфейсе. Новое сочетание в CSS — сначала сюда.
export const PAIRS: Pair[] = [
  { fg: 'ink', bg: 'surface', where: 'основной текст на карточке/списке', kind: 'text' },
  { fg: 'ink', bg: 'canvas', where: 'основной текст на фоне страницы', kind: 'text' },
  { fg: 'ink', bg: 'surface-sunk', where: 'текст в чётной строке (зебра)', kind: 'text' },
  { fg: 'ink-2', bg: 'surface', where: 'подсказка, второстепенный текст', kind: 'text' },
  { fg: 'ink-2', bg: 'canvas', where: 'подсказка на фоне страницы', kind: 'text' },
  { fg: 'ink-2', bg: 'surface-sunk', where: 'подсказка в чётной строке', kind: 'text' },
  { fg: 'accent', bg: 'surface', where: 'ссылка, активный пункт меню', kind: 'text' },
  { fg: 'accent', bg: 'canvas', where: 'ссылка на фоне страницы', kind: 'text' },
  { fg: 'on-accent', bg: 'accent', where: 'текст на главной кнопке', kind: 'text' },
  { fg: 'accent', bg: 'accent-soft', where: 'выбранный пункт, мягкая кнопка', kind: 'text' },
  { fg: 'st-red-ink', bg: 'st-red-bg', where: '🔴 просрочено', kind: 'text' },
  { fg: 'st-orange-ink', bg: 'st-orange-bg', where: '🟠 горит 0–7 дн.', kind: 'text' },
  { fg: 'st-yellow-ink', bg: 'st-yellow-bg', where: '🟡 скоро 8–30 дн.', kind: 'text' },
  { fg: 'st-green-ink', bg: 'st-green-bg', where: '🟢 в порядке / сделано', kind: 'text' },
  { fg: 'st-grey-ink', bg: 'st-grey-bg', where: '⚪ неактивно, архив', kind: 'text' },
  { fg: 'st-red-ink', bg: 'surface', where: 'текст ошибки в форме', kind: 'text' },
  { fg: 'on-toast', bg: 'toast', where: 'всплывающее «Сохранено / Отменить»', kind: 'text' },
  { fg: 'toast-action', bg: 'toast', where: 'кнопка «Отменить» в уведомлении', kind: 'text' },
  { fg: 'field-border', bg: 'surface', where: 'рамка поля ввода', kind: 'ui' },
  { fg: 'focus', bg: 'surface', where: 'кольцо фокуса на карточке', kind: 'ui' },
  { fg: 'focus', bg: 'canvas', where: 'кольцо фокуса на фоне', kind: 'ui' },
  { fg: 'stamp', bg: 'surface', where: 'оттиск штампа «Сдано»', kind: 'ui' },
];
