// Контраст по WCAG 2.2 (определение относительной яркости и коэффициента — https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio).

export type Theme = 'light' | 'dark';
export type Tokens = Record<string, string>;

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m || !m[1]) throw new Error(`Ожидался цвет вида #RRGGBB, получено «${hex}»`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Вырезает тело блока `selector { … }` (без вложенных скобок внутри). */
function blockBody(css: string, selector: string, from = 0): string {
  const start = css.indexOf(selector, from);
  if (start < 0) throw new Error(`В tokens.css нет блока «${selector}»`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

function parseVars(body: string): Tokens {
  const out: Tokens = {};
  for (const m of body.matchAll(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    if (m[1] && m[2]) out[m[1]] = m[2].toUpperCase();
  }
  return out;
}

/**
 * Читает цвета из tokens.css. Светлая тема — блок `:root {`, тёмная — `:root[data-theme='dark'] {`.
 * Блок внутри `@media (prefers-color-scheme: dark)` обязан совпадать с тёмным (проверяет тест).
 */
export function readThemes(css: string) {
  const light = parseVars(blockBody(css, ':root {'));
  const dark = { ...light, ...parseVars(blockBody(css, ":root[data-theme='dark'] {")) };
  const mediaAt = css.indexOf('@media (prefers-color-scheme: dark)');
  const mediaDark = { ...light, ...parseVars(blockBody(css, ":root:not([data-theme='light']) {", mediaAt)) };
  return { light, dark, mediaDark };
}

/** Цвета вида A (styles/look-a/tokens.css) поверх общих: те же три темы, блоки с [data-look='a']. */
export function readThemesA(baseCss: string, aCss: string) {
  const base = readThemes(baseCss);
  const light = { ...base.light, ...parseVars(blockBody(aCss, ":root[data-look='a'] {")) };
  const dark = { ...light, ...parseVars(blockBody(aCss, ":root[data-look='a'][data-theme='dark'] {")) };
  const mediaAt = aCss.indexOf('@media (prefers-color-scheme: dark)');
  const mediaDark = { ...light, ...parseVars(blockBody(aCss, ":root[data-look='a']:not([data-theme='light']) {", mediaAt)) };
  return { light, dark, mediaDark };
}

export interface Pair {
  fg: string;
  bg: string;
  where: string;
  /** text — текст (порог 4,5); ui — граница поля, кольцо фокуса (порог 3 по WCAG 1.4.11). */
  kind: 'text' | 'ui';
}

export const MIN_TEXT = 4.5;
export const MIN_UI = 3;
