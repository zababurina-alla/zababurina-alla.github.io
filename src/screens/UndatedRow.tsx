// Строка «Без даты срока»: с флагом dueSet мама выбирает дату прямо здесь (deadlines.update { due }); без флага — как было,
// только текст. Запись идёт той же очередью, что и «Перенести срок»: строка остаётся с «сохраняется…», пока таблица не
// ответила, — после ответа сервера срок сам встаёт на свой день. Отказ и CONFLICT показывает общий механизм уведомлений.
import { useState } from 'react';
import { canWrite, hasFeature } from '../config';
import { useStore } from '../data/store';
import type { Deadline } from '../data/types';
import { fmtDate } from '../lib/dates';
import { Icon } from '../ui/Icon';
import { SaveBadge } from '../ui/kit';
import { shortName } from '../ui/names';
import { roMessage } from '../ui/readonly';
import { TableText } from '../ui/TableText';

export function UndatedRow({ d }: { d: Deadline }) {
  const store = useStore();
  const [date, setDate] = useState('');
  const c = store.client(d.clientId);
  const who = c ? shortName(c.name) : 'клиент не найден';
  const settable = hasFeature('dueSet');
  const can = canWrite('deadlines');
  const saving = store.pending.some((p) => p.op.kind === 'updateDeadline' && p.op.id === d.id);
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date);
  return (
    <li className="closed__row">
      <Icon name="calendar" tile="wheat" />
      <span className="closed__text"><strong>{who}</strong> — <TableText text={d.what} /></span>
      {settable && (saving ? <SaveBadge state="saving" offline={!store.online} /> : (
        <span className="undated__set">
          <label className="undated__date">
            <span className="visually-hidden">Дата срока: {d.what}, {who}</span>
            <input type="date" className="input input--sm" value={date} disabled={!can} title={can ? undefined : roMessage('deadlines')}
              onChange={(e) => setDate(e.target.value)} />
          </label>
          <button type="button" className="btn btn--secondary btn--sm" disabled={!can || !dateOk}
            onClick={() => { store.updateDeadline(d.id, { due: date }, `Дата срока «${d.what}», ${who}: ${fmtDate(date)}`); }}>Поставить дату</button>
        </span>
      ))}
    </li>
  );
}
