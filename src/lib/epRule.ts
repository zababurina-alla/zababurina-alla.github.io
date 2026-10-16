// Ставка ЄП группы словами из листа «⚙️ Справочники» («10 % ПМ», «20 % МЗП», «5 % дохода») → число и база.
// Это читалка: корпус «правило → процент и база», «верно N из M» — в epRule.test.ts. Цифр ставок в коде нет: всё из листа.

export type EpBase = 'pm' | 'mzp' | 'income';
export interface EpRule { pct: number; base: EpBase }

export function parseEpRule(raw: string): EpRule | null {
  const t = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  const m = /(\d+(?:[.,]\d+)?)\s*%/.exec(t);
  if (!m?.[1]) return null;
  const pct = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return null;
  const rest = t.slice(m.index + m[0].length);
  if (/^\s*(від\s+|от\s+)?(пм|прожитков)/.test(rest)) return { pct, base: 'pm' };
  if (/^\s*(від\s+|от\s+)?(мзп|мінімальн|минимальн)/.test(rest)) return { pct, base: 'mzp' };
  if (/^\s*(від\s+|от\s+)?(доход|оборот)/.test(rest) || !rest.trim()) return { pct, base: 'income' };
  return null;
}

/** ЄП в копейках: от ПМ/МЗП — в месяц (фиксированный), от дохода — с дохода периода. null — нечем посчитать. */
export function epAmount(rule: EpRule, base: { pmKopecks: number | null; mzpKopecks: number | null; incomeKopecks: number | null }): number | null {
  const of = rule.base === 'pm' ? base.pmKopecks : rule.base === 'mzp' ? base.mzpKopecks : base.incomeKopecks;
  return of === null ? null : Math.round((of * rule.pct) / 100);
}
