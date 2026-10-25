// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio, MIN_TEXT, MIN_UI, readThemes, readThemesA } from './contrast-lib.ts';
import { PAIRS } from './contrast-pairs.ts';

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
const themes = readThemes(css);
// Вид A «Тихий премиум» (DESIGN.md, 25.10.2026) — те же пары на его палитре
const themesA = readThemesA(css, readFileSync(new URL('../src/styles/look-a/tokens.css', import.meta.url), 'utf8'));

describe('формула контраста', () => {
  it('чёрный на белом = 21, белый на белом = 1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });
  it('серый таблицы #6B7280 на #F3F4F6 ниже 4,5 — поэтому на сайте свой серый', () => {
    expect(contrastRatio('#6B7280', '#F3F4F6')).toBeLessThan(MIN_TEXT);
  });
});

describe('тёмная тема по настройке системы совпадает с выбранной вручную', () => {
  it('одинаковые значения', () => expect(themes.mediaDark).toEqual(themes.dark));
});

describe.each(Object.entries(themes).filter(([n]) => n !== 'mediaDark'))('пары цветов: %s', (_name, tok) => {
  it.each(PAIRS.map((p) => [p.where, p] as const))('%s', (_w, p) => {
    const fg = tok[p.fg];
    const bg = tok[p.bg];
    expect(fg, `нет --${p.fg}`).toBeDefined();
    expect(bg, `нет --${p.bg}`).toBeDefined();
    const ratio = contrastRatio(fg as string, bg as string);
    expect(ratio).toBeGreaterThanOrEqual(p.kind === 'text' ? MIN_TEXT : MIN_UI);
  });
});

describe('вид A: тёмная по настройке системы совпадает с выбранной вручную', () => {
  it('одинаковые значения', () => expect(themesA.mediaDark).toEqual(themesA.dark));
});

describe.each(Object.entries(themesA).filter(([n]) => n !== 'mediaDark'))('вид A, пары цветов: %s', (_name, tok) => {
  it.each(PAIRS.map((p) => [p.where, p] as const))('%s', (_w, p) => {
    const ratio = contrastRatio(tok[p.fg] as string, tok[p.bg] as string);
    expect(ratio).toBeGreaterThanOrEqual(p.kind === 'text' ? MIN_TEXT : MIN_UI);
  });
});
