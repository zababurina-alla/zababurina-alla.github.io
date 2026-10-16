import { describe, expect, it } from 'vitest';
import { epAmount, parseEpRule } from './epRule';

// Корпус «ставка ЄП словами из листа → процент и база». Новый промах — сюда.
const CORPUS: [string, string | null][] = [
  ['10 % ПМ', '10|pm'], ['10% ПМ', '10|pm'], ['20 % МЗП', '20|mzp'], ['20% МЗП', '20|mzp'], ['5 % дохода', '5|income'],
  ['5% доходу', '5|income'], ['3 % доходу', '3|income'], ['5 %', '5|income'], ['до 10 % ПМ', '10|pm'], ['до 20 % МЗП', '20|mzp'],
  ['10 % від ПМ', '10|pm'], ['20 % от МЗП', '20|mzp'], ['10 % прожиткового мінімуму', '10|pm'], ['20 % мінімальної зарплати', '20|mzp'],
  ['5 % від доходу', '5|income'], ['1 % обороту', '1|income'], ['2,5 % доходу', '2.5|income'],
  ['', null], ['—', null], ['ставка не указана', null], ['0 % ПМ', null], ['150 % МЗП', null], ['10 % чего-то', null],
];

describe('ставка ЄП: корпус', () => {
  const results = CORPUS.map(([s, want]) => { const r = parseEpRule(s); return { s, want, got: r ? `${r.pct}|${r.base}` : null }; });
  const right = results.filter((r) => r.got === r.want).length;
  it(`верно ${right} из ${CORPUS.length}`, () => {
    console.log(`Ставка ЄП: верно ${right} из ${CORPUS.length}`);
    expect(results.filter((r) => r.got !== r.want)).toEqual([]);
  });
  it('сумма: от ПМ и МЗП — в месяц, от дохода — с дохода; нет базы — null', () => {
    const base = { pmKopecks: 302800, mzpKopecks: 800000, incomeKopecks: 15000000 };
    expect(epAmount({ pct: 10, base: 'pm' }, base)).toBe(30280);
    expect(epAmount({ pct: 20, base: 'mzp' }, base)).toBe(160000);
    expect(epAmount({ pct: 5, base: 'income' }, base)).toBe(750000);
    expect(epAmount({ pct: 5, base: 'income' }, { ...base, incomeKopecks: null })).toBeNull();
  });
});
