// Отчёт числом: сколько разных радиусов, отступов, размеров шрифта… стоит в CSS сайта и сколько нарушений DESIGN.md
// в каждом файле. Запуск: npm run design [-- --where] [-- --baseline]
//   --where     показать, где встречается каждое значение (первые 6 мест);
//   --baseline  записать текущие числа нарушений в scripts/design-baseline.json (только если стало меньше — см. тест).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkAll, distinct, readTokens } from './design-lib.ts';

const STYLES = fileURLToPath(new URL('../src/styles', import.meta.url));
const BASELINE = fileURLToPath(new URL('./design-baseline.json', import.meta.url));
const tok = readTokens(readFileSync(`${STYLES}/tokens.css`, 'utf8'));
const reports = checkAll(STYLES);
const where = process.argv.includes('--where');

console.log('Разных значений в CSS (без tokens.css и print.css):');
for (const [g, map] of Object.entries(distinct(reports, tok))) {
  const rows = [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  console.log(`  ${g}: ${rows.length} — ${rows.map(([v, at]) => `${v}×${at.length}`).join(', ')}`);
  if (where) for (const [v, at] of rows) console.log(`      ${v}: ${at.slice(0, 6).join(', ')}${at.length > 6 ? ' …' : ''}`);
}

const counts: Record<string, number> = {};
console.log('\nНарушений DESIGN.md по файлам:');
for (const r of reports) {
  counts[r.file] = r.violations.length;
  const byRule: Record<string, number> = {};
  for (const v of r.violations) byRule[v.rule] = (byRule[v.rule] ?? 0) + 1;
  const detail = Object.entries(byRule).map(([k, n]) => `${k} ${n}`).join(', ');
  console.log(`  ${r.file.padEnd(14)} ${String(r.violations.length).padStart(4)}${detail ? `  (${detail})` : ''}`);
  if (where) for (const v of r.violations) console.log(`      ${v.file}:${v.line}  ${v.prop}: ${v.why}`);
}
console.log(`  всего ${Object.values(counts).reduce((a, b) => a + b, 0)}`);

if (process.argv.includes('--baseline')) {
  writeFileSync(BASELINE, `${JSON.stringify(counts, null, 2)}\n`);
  console.log(`\nБаза записана: ${BASELINE}`);
}
