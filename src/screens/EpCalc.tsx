// «Сколько ЄП при доходе N» (бот: ep_calc_custom) — по ставкам листа «⚙️ Справочники» (reference.rates), без цифр в коде.
// Доход — за квартал (третья группа платит и декларирует поквартально); первая и вторая — фиксированный ЄП в месяц, за
// квартал — ×3. Предел группы — годовой: квартал ×4 только как оценка, с подписью. Оформление — за отделом дизайна.
import { useId, useState } from 'react';
import type { Rates } from '../data/types';
import { epAmount, parseEpRule } from '../lib/epRule';
import { formatMoney, parseMoney } from '../lib/money';

export function EpCalc({ r }: { r: Rates }) {
  const ids = useId();
  const [sum, setSum] = useState('');
  const money = parseMoney(sum);
  const income = money.ok ? money.kopecks : null;
  const rows = r.groups.filter((g) => g.group >= 1 && g.group <= 3).map((g) => {
    const rule = parseEpRule(g.epRule);
    const amount = rule ? epAmount(rule, { pmKopecks: r.pmKopecks, mzpKopecks: r.mzpKopecks, incomeKopecks: income }) : null;
    const perQuarter = rule && amount !== null ? (rule.base === 'income' ? amount : amount * 3) : null;
    const yearEstimate = income !== null ? income * 4 : null;
    const over = g.limitKopecks !== null && yearEstimate !== null && yearEstimate > g.limitKopecks;
    return { g, rule, perQuarter, over };
  });
  return (
    <section className="panel panel--pad epcalc" aria-labelledby={`${ids}-t`}>
      <h2 id={`${ids}-t`} className="panel__title">Сколько ЄП при доходе</h2>
      <div className="field">
        <label className="field__label" htmlFor={`${ids}-sum`}>Доход за квартал, ₴</label>
        <input id={`${ids}-sum`} className="input input--money num" inputMode="decimal" value={sum} onChange={(e) => setSum(e.target.value)} placeholder="например, 150 000" autoComplete="off" />
        {sum.trim() && !money.ok && <p className="field__error" role="alert">{money.error}</p>}
      </div>
      {income !== null && (
        <ul className="epcalc__list">
          {rows.map(({ g, rule, perQuarter, over }) => (
            <li key={g.group}>
              <strong>{g.group} группа</strong>{' '}
              {perQuarter !== null && rule
                ? <span className="num">{formatMoney(perQuarter)} за квартал <span className="sub">({g.epRule}{rule.base === 'income' ? '' : ' в месяц, ×3'})</span></span>
                : <span className="nil">ставка «{g.epRule || '—'}» — не посчитать</span>}
              {over && <span className="field__error"> — доход ×4 больше предела группы {formatMoney(g.limitKopecks ?? 0)} в год (оценка)</span>}
            </li>
          ))}
        </ul>
      )}
      <p className="sub">Ставки — из таблицы ({r.year}). Предел группы — за год; здесь — оценка по кварталу ×4.</p>
    </section>
  );
}
