// Шкалы эталона DESIGN.md и разбор CSS сайта: что стоит в коде и что вне шкалы.
// Используют: scripts/design-audit.ts (отчёт числом) и scripts/design-scale.test.ts (сторож в npm test).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type Decl = { file: string; line: number; prop: string; value: string };
export type Rule = 'token' | 'radius' | 'spacing' | 'fontSize' | 'fontWeight' | 'fontFamily' | 'lineHeight' | 'letterSpacing' | 'shadow' | 'color';
export type Violation = Decl & { rule: Rule; why: string };

/** Шкалы DESIGN.md (утверждены владельцем 18.10.2026). Значения — после раскрытия токенов, rem → px (1rem = 16px). */
export const SCALE = {
  radius: ['0', '12px', '20px', '999px', '50%', 'inherit'],
  spacing: [0, 4, 8, 12, 16, 24, 32, 48, 64],
  fontSize: ['15px', '17px', '20px', '26px', '36px', '44px', 'inherit', '1em'],
  fontWeight: ['400', '500', '600', 'inherit', 'normal'],
  lineHeight: ['1', '1.12', '1.3', '1.5', 'inherit', 'normal'],
  letterSpacing: ['-0.02em', '0.14em', '-0.011em', '0', 'normal', 'inherit'],
  fontFamily: ['var(--font)', 'var(--display)', 'inherit'],
  /** Доли прозрачности цвета от токена (color-mix). 0 и 100 — концы анимации. */
  mix: [0, 8, 16, 24, 40, 70, 100],
  /** Тени с размытием — только эти токены. */
  shadowTokens: ['--shadow-1', '--shadow-2', '--shadow-3'],
};

/** Устаревшие имена токенов: шкала сужена 18.10.2026, они равны ближайшему значению эталона. В новых правилах не писать. */
export const RETIRED_TOKENS = ['--radius-xs', '--radius-sm', '--radius-lg', '--radius-2xl', '--text-xs', '--weight-bold'];

/** Вырезать комментарии, сохранив переводы строк (номера строк не сдвигаются). */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

/** Объявления «свойство: значение» с номером строки. Селекторы вида a:hover не попадают: у них после значения «{». */
export function declarations(css: string, file: string): Decl[] {
  const src = stripComments(css);
  const out: Decl[] = [];
  const re = /(?:^|[{;\s])(-{0,2}[a-z][a-z0-9-]*)\s*:\s*([^;{}]+?)\s*(?=;|})/gi;
  for (const m of src.matchAll(re)) {
    const prop = (m[1] ?? '').toLowerCase();
    const at = (m.index ?? 0) + m[0].indexOf(m[1] ?? '');
    out.push({ file, line: src.slice(0, at).split('\n').length, prop, value: (m[2] ?? '').trim() });
  }
  return out;
}

/** Токены :root светлой темы (первое объявление каждого имени). */
export function readTokens(css: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const d of declarations(css, 'tokens.css')) if (d.prop.startsWith('--') && !(d.prop in map)) map[d.prop] = d.value;
  return map;
}

/** Раскрыть var(--x[, запас]) до конца и перевести rem в px. */
export function resolve(value: string, tok: Record<string, string>, depth = 0): string {
  if (depth > 10) return value;
  const v = value.replace(/var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/gi, (whole, name: string, fb?: string) =>
    tok[name] !== undefined ? resolve(tok[name], tok, depth + 1) : fb !== undefined ? resolve(fb, tok, depth + 1) : whole);
  return v.replace(/(-?\d*\.?\d+)rem\b/g, (_, n: string) => `${+(Number(n) * 16).toFixed(2)}px`);
}

/** Разбить по пробелам (или запятым) верхнего уровня; скобки — целиком. */
export function split(v: string, sep: ' ' | ',' = ' '): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of v) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    const isSep = sep === ' ' ? /\s/.test(ch) : ch === ',';
    if (isSep && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter((x) => x !== '!important' && x !== '/');
}

const COLOR_LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab)\(/gi;
const SPACING_PROP = /^(padding|margin)(-(top|right|bottom|left|inline|block)(-(start|end))?)?$|^(gap|row-gap|column-gap)$/;

/** Отступ в шкале: 0, auto, шаг шкалы (и минус шаг), env(). calc() проверяется как написан: числа в нём — только шаги
 *  шкалы, ссылки на токены (размер значка, кнопки) можно — так пишется «отступ под аватар». */
function spacingOk(raw: string, tok: Record<string, string>): boolean {
  if (/^(calc|max|min|clamp)\(/.test(raw)) {
    const lens = raw.replace(/var\([^()]*\)/g, '').match(/-?\d*\.?\d+(px|rem|em|%|vh|vw|mm)/g) ?? [];
    return lens.every((l) => SCALE.spacing.includes(Math.abs(parseFloat(resolve(l, tok)))) && /(px|rem)$/.test(l));
  }
  const part = resolve(raw, tok);
  if (part === 'auto' || part === 'inherit' || /^env\(/.test(part)) return true;
  const m = /^(-?\d*\.?\d+)(px)?$/.exec(part);
  return !!m && SCALE.spacing.includes(Math.abs(Number(m[1])));
}

/** Слой тени без размытия (рамка, линия, кольцо фокуса) или токен тени. */
function shadowLayerOk(raw: string, tok: Record<string, string>): boolean {
  const t = raw.trim();
  if (t === 'none' || /^var\(--shadow-[123]\)$/.test(t)) return true;
  const lens = split(resolve(t, tok)).filter((p) => /^-?\d*\.?\d+(px|mm)?$/.test(p));
  const blur = lens[2];
  return blur === undefined || parseFloat(blur) === 0;
}

/** Проверить одно объявление; tokens.css (место, где шкала задаётся) не проверяется. */
export function check(d: Decl, tok: Record<string, string>): Violation[] {
  const out: Violation[] = [];
  const bad = (rule: Rule, why: string) => out.push({ ...d, rule, why });
  const { prop, value } = d;
  for (const name of RETIRED_TOKENS) if (new RegExp(`var\\(${name}(?![\\w-])`).test(value)) bad('token', `устаревший токен ${name}`);

  if (!prop.startsWith('--') && !/^-?(webkit-)?mask/.test(prop)) {
    for (const c of value.match(COLOR_LITERAL) ?? []) bad('color', `цвет «${c}» не из палитры`);
  }
  for (const m of value.matchAll(/color-mix\([^,]+,\s*[^,]*?(\d+(?:\.\d+)?)%/g)) {
    if (!SCALE.mix.includes(Number(m[1]))) bad('color', `прозрачность ${m[1]} % вне шкалы ${SCALE.mix.join('/')}`);
  }
  if (prop.startsWith('--')) return out;

  const r = resolve(value.replace(/\s*!important$/, ''), tok);
  if (/^border(-[a-z]+)*-radius$/.test(prop)) {
    for (const p of split(r)) if (!SCALE.radius.includes(p)) bad('radius', `радиус ${p}`);
  } else if (SPACING_PROP.test(prop)) {
    for (const p of split(value.replace(/\s*!important$/, ''))) if (!spacingOk(p, tok)) bad('spacing', `отступ ${resolve(p, tok)}`);
  } else if (prop === 'font-size') {
    if (!SCALE.fontSize.includes(r) && !/^var\(--text-hero\)$/.test(value.trim())) bad('fontSize', `размер ${r}`);
  } else if (prop === 'font-weight') {
    if (!SCALE.fontWeight.includes(r)) bad('fontWeight', `начертание ${r}`);
  } else if (prop === 'line-height') {
    if (!SCALE.lineHeight.includes(r)) bad('lineHeight', `межстрочный ${r}`);
  } else if (prop === 'letter-spacing') {
    if (!SCALE.letterSpacing.includes(r)) bad('letterSpacing', `трекинг ${r}`);
  } else if (prop === 'font-family') {
    if (!SCALE.fontFamily.includes(value.trim())) bad('fontFamily', `шрифт ${value}`);
  } else if (prop === 'box-shadow' || prop === 'text-shadow') {
    for (const layer of split(value.replace(/\s*!important$/, ''), ',')) if (!shadowLayerOk(layer, tok)) bad('shadow', `своя тень «${layer}»`);
  }
  return out;
}

/** Файлы, которые сторож не проверяет: tokens.css задаёт шкалу; print.css — бумага (мм, пункты, чёрно-белая палитра). */
export const EXEMPT = ['tokens.css', 'print.css'];

export type FileReport = { file: string; decls: Decl[]; violations: Violation[] };

/** Проверить все CSS сайта в src/styles (src/concept — старый прототип, в сборку не входит). */
export function checkAll(stylesDir: string): FileReport[] {
  const tok = readTokens(readFileSync(join(stylesDir, 'tokens.css'), 'utf8'));
  return readdirSync(stylesDir)
    .filter((f) => f.endsWith('.css'))
    .sort()
    .map((f) => {
      const decls = declarations(readFileSync(join(stylesDir, f), 'utf8'), f);
      const violations = EXEMPT.includes(f) ? [] : decls.flatMap((d) => check(d, tok));
      return { file: f, decls, violations };
    });
}

/** Сколько разных значений по группам стоит в коде (после раскрытия токенов). Для отчёта «было / стало». */
export function distinct(reports: FileReport[], tok: Record<string, string>): Record<string, Map<string, string[]>> {
  const groups: Record<string, (p: string) => boolean> = {
    radius: (p) => /^border(-[a-z]+)*-radius$/.test(p),
    spacing: (p) => SPACING_PROP.test(p),
    fontSize: (p) => p === 'font-size',
    fontWeight: (p) => p === 'font-weight',
    lineHeight: (p) => p === 'line-height',
    letterSpacing: (p) => p === 'letter-spacing',
  };
  const res: Record<string, Map<string, string[]>> = {};
  for (const g of Object.keys(groups)) res[g] = new Map();
  for (const rep of reports) {
    if (EXEMPT.includes(rep.file)) continue;
    for (const d of rep.decls) {
      for (const [g, test] of Object.entries(groups)) {
        if (!test(d.prop)) continue;
        const r = resolve(d.value.replace(/\s*!important$/, ''), tok);
        const vals = g === 'radius' || g === 'spacing' ? split(r) : [r];
        for (const v of vals) {
          const m = res[g] as Map<string, string[]>;
          if (!m.has(v)) m.set(v, []);
          m.get(v)?.push(`${d.file}:${d.line}`);
        }
      }
    }
  }
  return res;
}
