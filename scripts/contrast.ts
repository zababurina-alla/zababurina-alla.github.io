// Печатает таблицу контраста «пара → коэффициент» по tokens.css и пишет её в docs/контраст.md.
// Запуск: npm run contrast. Падает с кодом 1, если хоть одна пара ниже порога.
import { readFileSync, writeFileSync } from 'node:fs';
import { contrastRatio, MIN_TEXT, MIN_UI, readThemes } from './contrast-lib.ts';
import { PAIRS } from './contrast-pairs.ts';

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
const t = readThemes(css);
const themes = [
  ['Светлая', t.light],
  ['Тёмная', t.dark],
] as const;

const fmt = (n: number) => n.toFixed(2).replace('.', ',');
let failed = 0;
let total = 0;
const lines: string[] = [
  '# Контраст цветов кабинета',
  '',
  'Создано `npm run contrast` из `src/styles/tokens.css`. Формула — WCAG 2.2. Порог: текст ≥ 4,5 : 1;',
  'рамки полей, кольцо фокуса, точки статуса ≥ 3 : 1 (WCAG 1.4.11, не текст).',
  '',
  `| Где | Текст / элемент | Фон | ${themes.map(([n]) => n).join(' | ')} |`,
  `|---|---|---|${themes.map(() => '---:').join('|')}|`,
];
for (const p of PAIRS) {
  const min = p.kind === 'text' ? MIN_TEXT : MIN_UI;
  const cells = themes.map(([, tok]) => {
    const fg = tok[p.fg];
    const bg = tok[p.bg];
    if (!fg || !bg) throw new Error(`Нет токена --${fg ? p.bg : p.fg}`);
    const r = contrastRatio(fg, bg);
    total++;
    if (r < min) failed++;
    return r < min ? `**${fmt(r)} ✗**` : fmt(r);
  });
  lines.push(`| ${p.where} | \`--${p.fg}\` | \`--${p.bg}\` | ${cells.join(' | ')} |`);
}
lines.push('', `Пар проверено: ${total}, ниже порога: ${failed}.`, '');
writeFileSync(new URL('../docs/контраст.md', import.meta.url), lines.join('\n'));
console.log(lines.slice(5).join('\n'));
process.exit(failed ? 1 : 0);
