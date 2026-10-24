// «Платежи → Без даты или суммы» за флагом paymentsFill: дописать недостающую дату и/или сумму прямо в строке
// (payments.update { date?, amountKopecks? }). Сервер пишет только в пустую ячейку, поэтому поле есть лишь у того, чего нет.
// Запись идёт общей очередью: пока она не решена — «сохраняется…» (или «не сохранилось — повторить»), поле скрыто, двойной записи не будет.
// Отказ сервера (в том числе «уже заполнено в таблице») показывает общий механизм уведомлений с его текстом.
import { useState } from 'react';
import { canWrite } from '../config';
import { useStore } from '../data/store';
import type { PaymentPatch } from '../data/api';
import type { Payment } from '../data/types';
import { TODAY, addDays } from '../lib/dates';
import { parseMoney } from '../lib/money';
import { SaveBadge } from '../ui/kit';
import { roMessage } from '../ui/readonly';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const LAST_DATE = addDays(TODAY, 1); // как у записи платежа: не позже завтра

export function PaymentFill({ p, who }: { p: Payment; who: string }) {
  const store = useStore();
  const [date, setDate] = useState('');
  const [sum, setSum] = useState('');
  const can = canWrite('payments');
  const queued = store.pending.find((i) => i.op.kind === 'updatePayment' && i.op.id === p.id);
  const needDate = p.date === null;
  const needSum = p.kopecks === null;

  if (queued) {
    return (
      <div className="paylist__fill">
        <SaveBadge state={queued.state === 'failed' ? 'failed' : 'saving'} offline={!store.online} onRetry={() => store.retry(queued.op.requestId)} />
      </div>
    );
  }

  const dateErr = !needDate || !date ? '' : !ISO.test(date) ? 'Не понял дату' : date > LAST_DATE ? 'Дата оплаты ещё не наступила' : '';
  const money = needSum && sum.trim() ? parseMoney(sum) : null;
  const sumErr = money && !money.ok ? money.error : '';
  const patch: PaymentPatch = {};
  if (needDate && date && !dateErr) patch.date = date;
  if (money?.ok) patch.amountKopecks = money.kopecks;
  const ready = Object.keys(patch).length > 0 && !dateErr && !sumErr;

  return (
    <form className="paylist__fill inline-edit" onSubmit={(e) => {
      e.preventDefault();
      if (!ready || !can) return;
      store.updatePayment(p.id, patch, `Дописать платёж: ${who}`);
    }}>
      {needDate && (
        <label className="paylist__field">
          <span className="visually-hidden">Дата платежа: {who}</span>
          <input type="date" className="input input--sm" value={date} max={LAST_DATE} disabled={!can} title={can ? undefined : roMessage('payments')}
            aria-invalid={dateErr !== ''} onChange={(e) => setDate(e.target.value)} />
        </label>
      )}
      {needSum && (
        <label className="paylist__field">
          <span className="visually-hidden">Сумма платежа: {who}</span>
          <input type="text" inputMode="decimal" className="input input--sm num" placeholder="Сумма, ₴" value={sum} disabled={!can} autoComplete="off"
            title={can ? undefined : roMessage('payments')} aria-invalid={sumErr !== ''} onChange={(e) => setSum(e.target.value)} />
        </label>
      )}
      <button type="submit" className="btn btn--secondary btn--sm" disabled={!can || !ready}>Дописать</button>
      {(dateErr || sumErr) && <span className="field__error" role="alert">{dateErr || sumErr}</span>}
    </form>
  );
}
