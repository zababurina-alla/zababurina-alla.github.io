// Действия со сроком, кроме закрытия (deadlines.update, контракт 8.3): «В работе», «Ожидание», «Отложить до…»,
// «Перенести срок…». Раскрываются прямо в строке — без всплывающих окон, работает пальцем и клавиатурой.
// Отложить — статус «отложено» + новая дата; перенести — только дата (таблица сама может поставить «в работе»).
import { useState } from 'react';
import { canWrite } from '../config';
import { useStore } from '../data/store';
import type { DatedDeadline, DeadlineStatus } from '../data/types';
import { TODAY, addDays, fmtDate } from '../lib/dates';
import { Icon } from '../ui/Icon';
import { roMessage } from '../ui/readonly';

export const STATUS_LABEL: Record<DeadlineStatus, string> = {
  new: 'новый', inProgress: 'в работе', waiting: 'ожидание', postponed: 'отложено', done: 'сдано',
};

export function StatusTag({ status }: { status: DeadlineStatus }) {
  if (status === 'new' || status === 'done') return null;
  return <span className={`tag tag--status tag--${status}`}>{STATUS_LABEL[status]}</span>;
}

export function DeadlineActions({ d }: { d: DatedDeadline }) {
  const store = useStore();
  const [open, setOpen] = useState(false);
  // По умолчанию — неделя после срока (или после сегодня, если срок уже прошёл): «отложить» не должно двигать назад.
  const [date, setDate] = useState(addDays(d.due > TODAY ? d.due : TODAY, 7));
  const can = canWrite('deadlines');
  const who = store.client(d.clientId)?.name.split(' ').slice(0, 2).join(' ');
  const what = `«${d.what}»${who ? `, ${who}` : ''}`;
  const done = () => setOpen(false);
  if (!open) {
    return (
      <button type="button" className="btn btn--ghost btn--sm dactions__toggle" aria-expanded={false} aria-label={`Другие действия со сроком ${what}`}
        onClick={() => setOpen(true)}>
        <Icon name="more" size={18} />Действия
      </button>
    );
  }
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date) && date !== d.due;
  return (
    <div className="dactions" role="group" aria-label={`Действия со сроком ${what}`}>
      {/* Только просмотр: меню видно (мама узнаёт, что здесь будет), пункты недоступны и подписаны (п. 8). */}
      {!can && <p className="sub dactions__ro">{roMessage('deadlines')}</p>}
      {d.status !== 'inProgress' && (
        <button type="button" className="btn btn--secondary btn--sm" disabled={!can} onClick={() => { store.updateDeadline(d.id, { status: 'inProgress' }, `В работе: ${what}`); done(); }}>В работе</button>
      )}
      {d.status !== 'waiting' && (
        <button type="button" className="btn btn--secondary btn--sm" disabled={!can} onClick={() => { store.updateDeadline(d.id, { status: 'waiting' }, `Ожидание: ${what}`); done(); }}>Ожидание</button>
      )}
      <label className="dactions__date">
        <span className="sub">Дата</span>
        <input type="date" className="input input--sm" value={date} min={TODAY} disabled={!can} onChange={(e) => setDate(e.target.value)} />
      </label>
      <button type="button" className="btn btn--secondary btn--sm" disabled={!can || !dateOk}
        onClick={() => { store.updateDeadline(d.id, { status: 'postponed', due: date }, `Отложить ${what} до ${fmtDate(date)}`); done(); }}>Отложить до этой даты</button>
      <button type="button" className="btn btn--secondary btn--sm" disabled={!can || !dateOk}
        onClick={() => { store.updateDeadline(d.id, { due: date }, `Перенести ${what} на ${fmtDate(date)}`); done(); }}>Перенести срок</button>
      <button type="button" className="btn btn--ghost btn--sm" onClick={done}>{can ? 'Отмена' : 'Закрыть'}</button>
    </div>
  );
}
