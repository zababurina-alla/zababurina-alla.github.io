// @vitest-environment node
// Сторож эталона DESIGN.md: значения вне шкалы (радиусы, отступы, шрифты, тени, цвета) роняют npm test.
// Старые файлы ещё не переведены — для них «храповик»: нарушений не больше, чем в scripts/design-baseline.json,
// а стало меньше — базу надо опустить (npm run design -- --baseline), чтобы назад дороги не было.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { check, checkAll, declarations, readTokens, type Rule } from './design-lib.ts';

const STYLES = fileURLToPath(new URL('../src/styles', import.meta.url));
const tok = readTokens(readFileSync(`${STYLES}/tokens.css`, 'utf8'));
const baseline = JSON.parse(readFileSync(new URL('./design-baseline.json', import.meta.url), 'utf8')) as Record<string, number>;
const reports = checkAll(STYLES);

/** Экраны, переведённые на эталон целиком: ни одного нарушения. Добавлять сюда каждый следующий. */
const CONVERTED = ['today.css', 'payments.css', 'base.css', 'app.css'];

const rulesOf = (css: string) => declarations(css, 'проба.css').flatMap((d) => check(d, tok)).map((v) => v.rule);

describe('сторож ловит каждое нарушение (тест умеет падать)', () => {
  const cases: [string, string, Rule][] = [
    ['радиус 7 px', '.a { border-radius: 7px; }', 'radius'],
    ['радиус 16 px', '.a { border-radius: 1rem; }', 'radius'],
    ['отступ 6 px', '.a { padding: 6px 12px; }', 'spacing'],
    ['отступ 18 px в calc', '.a { margin-top: calc(var(--space-2) + 18px); }', 'spacing'],
    ['размер 13 px', '.a { font-size: 0.8125rem; }', 'fontSize'],
    ['размер 22 px', '.a { font-size: 22px; }', 'fontSize'],
    ['начертание 700', '.a { font-weight: 700; }', 'fontWeight'],
    ['межстрочный 1.45', '.a { line-height: 1.45; }', 'lineHeight'],
    ['трекинг 0.02em', '.a { letter-spacing: 0.02em; }', 'letterSpacing'],
    ['третий шрифт', '.a { font-family: Arial, sans-serif; }', 'fontFamily'],
    ['своя тень', '.a { box-shadow: 0 2px 6px var(--line); }', 'shadow'],
    ['цвет #RRGGBB', '.a { color: #123456; }', 'color'],
    ['цвет rgb()', '.a { background: rgb(0 0 0 / 0.1); }', 'color'],
    ['прозрачность 55 %', '.a { background: color-mix(in srgb, var(--accent) 55%, transparent); }', 'color'],
    ['устаревший токен', '.a { border-radius: var(--radius-sm); }', 'token'],
  ];
  it.each(cases)('%s', (_name, css, rule) => {
    expect(rulesOf(css)).toContain(rule);
  });

  it('значения эталона проходят', () => {
    const ok = `.a {
      border-radius: var(--radius-md); border-radius: var(--radius-xl) var(--radius-xl) 0 0; border-radius: 50%;
      padding: var(--space-3) var(--space-5); margin: calc(var(--space-2) * -1) auto 0;
      padding-left: calc(var(--avatar-md) + var(--space-3)); gap: var(--space-1) var(--space-2);
      font-size: var(--text-sm); font-size: var(--text-hero); font-weight: var(--weight-semibold);
      line-height: var(--leading-snug); letter-spacing: -0.02em; font-family: var(--display);
      box-shadow: inset 0 0 0 1px var(--line), var(--shadow-1); color: var(--ink-2);
      background: color-mix(in srgb, var(--accent) 8%, transparent);
    }`;
    expect(rulesOf(ok)).toEqual([]);
  });

  it('селектор с двоеточием не принимается за свойство', () => {
    expect(declarations('.a:hover, .b:focus-visible { color: var(--ink); }', 'x.css').map((d) => d.prop)).toEqual(['color']);
  });
});

describe('переведённые на эталон файлы — без единого нарушения', () => {
  it.each(CONVERTED)('%s', (file) => {
    const rep = reports.find((r) => r.file === file);
    expect(rep, `нет файла ${file}`).toBeDefined();
    expect(rep?.violations.map((v) => `${v.file}:${v.line} ${v.prop}: ${v.why}`)).toEqual([]);
  });
});

describe('остальные файлы — не хуже базы (храповик)', () => {
  it.each(reports.map((r) => [r.file, r] as const))('%s', (file, rep) => {
    const allowed = baseline[file] ?? 0;
    const list = rep.violations.map((v) => `${v.file}:${v.line} ${v.prop}: ${v.why}`);
    expect(rep.violations.length, `${file}: нарушений ${rep.violations.length} при базе ${allowed}. Новые значения — только из DESIGN.md:\n${list.join('\n')}`)
      .toBeLessThanOrEqual(allowed);
    expect(rep.violations.length, `${file}: стало меньше (${rep.violations.length} < ${allowed}) — опустите базу: npm run design -- --baseline`)
      .toBe(allowed);
  });
});
