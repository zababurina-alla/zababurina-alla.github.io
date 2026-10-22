// Карточка клиента → «Оборот за квартал» / «Прибыль за год» за флагом incomeEdit: ввод дохода (clients.update { income }).
// Основа (quarterTurnover / yearProfit) — та, что клиент уже имеет в снимке; нет её — по типу клиента, как описано в types.ts.
// Запись идёт общей очередью: пока она не решена — «сохраняется…»; отказ сервера и CONFLICT показывает общий механизм уведомлений.
import { useState } from 'react';
import { canWrite } from '../config';
import { useStore } from '../data/store';
import type { Client, IncomeBasis } from '../data/types';
import { formatMoney, parseMoney } from '../lib/money';
import { SaveBadge } from '../ui/kit';

/** Основа дохода по типу клиента, если сервер её ещё не назвал: ФОП 3 и ТОВ 3 — оборот квартала, ФОП общая — прибыль года. */
export function defaultIncomeBasis(kind: Client['kind']): IncomeBasis | null {
  if (kind === 'fop3' || kind === 'tov3') return 'quarterTurnover';
  if (kind === 'fopGeneral') return 'yearProfit';
  return null;
}

/** Доход может быть нулём (в отличие от платежа): «0» и «0,00» — верно. */
export function parseIncome(input: string): { ok: true; kopecks: number } | { ok: false; error: string } {
  if (/^\s*0+([.,]0{1,2})?\s*(₴|грн\.?)?\s*$/i.test(input)) return { ok: true, kopecks: 0 };
  const r = parseMoney(input);
  return r.ok ? { ok: true, kopecks: r.kopecks } : { ok: false, error: r.error === 'Сумма должна быть больше нуля' ? 'Доход не может быть отрицательным' : r.error };
}

export function IncomeEdit({ c, basis }: { c: Client; basis: IncomeBasis }) {
  const store = useStore();
  const [edit, setEdit] = useState<string | null>(null);
  const [base, setBase] = useState(c.version);
  const saving = store.pending.some((p) => p.op.kind === 'updateClient' && p.op.id === c.id && 'income' in p.op.patch);
  const hasIncome = c.incomeKopecks !== null && c.incomeKopecks !== undefined;
  const what = basis === 'quarterTurnover' ? 'Оборот за квартал, ₴' : 'Прибыль за год, ₴';
  const parsed = edit === null || edit.trim() === '' ? null : parseIncome(edit);
  const problem = parsed && !parsed.ok ? parsed.error : '';

  if (saving) return <p className="row-gap"><SaveBadge state="saving" offline={!store.online} /></p>;
  if (!canWrite('clients')) return <p className="sub">изменить — в таблице</p>;
  if (edit === null) {
    return (
      <p className="row-gap">
        <button type="button" className="link" onClick={() => { setBase(c.version); setEdit(hasIncome ? formatMoney(c.incomeKopecks ?? 0, false) : ''); }}>
          {hasIncome ? 'Изменить' : 'Указать'}
        </button>
      </p>
    );
  }
  return (
    <form className="inline-edit" onSubmit={(e) => {
      e.preventDefault();
      if (!parsed?.ok) return;
      if (!hasIncome || parsed.kopecks !== c.incomeKopecks || basis !== c.incomeBasis) store.updateIncome(c.id, { amountKopecks: parsed.kopecks, basis }, base);
      setEdit(null);
    }}>
      <input className="input num" value={edit} onChange={(e) => setEdit(e.target.value)} inputMode="decimal" autoFocus autoComplete="off"
        aria-label={what} aria-invalid={problem !== ''} aria-describedby={problem ? `${c.id}-income-err` : undefined} />
      <button type="submit" className="btn btn--primary btn--sm" disabled={!parsed?.ok}>Сохранить</button>
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEdit(null)}>Отмена</button>
      {problem && <span id={`${c.id}-income-err`} className="field__error" role="alert">{problem}</span>}
    </form>
  );
}
