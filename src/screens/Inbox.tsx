// «Входящие»: сообщения клиентов маме из Telegram (бизнес-бот), превращённые в предложения.
// Платёж — «Записать N ₴» / «Изменить сумму» / «Задача» / «Нет»; остальное — «Принято» / «Задача» / «Нет».
// Решено в Telegram — здесь сразу «решено» (сервер присылает upsert). Оформление — за отделом дизайна.
import { useState } from 'react';
import { canWrite } from '../config';
import { useStore } from '../data/store';
import type { InboxItem, InboxStatus, InboxType } from '../data/types';
import { TODAY, addDays, fmtDayMonth } from '../lib/dates';
import { formatMoney, parseMoney } from '../lib/money';
import { Icon } from '../ui/Icon';
import type { IconName } from '../ui/Icon';
import { Avatar } from '../ui/kit';
import { Empty } from '../ui/Empty';
import { roAttrs } from '../ui/readonly';
import { useUi } from '../app/ui-context';

export const INBOX_TYPE: Record<InboxType, { label: string; icon: IconName }> = {
  payment: { label: 'Платёж', icon: 'wallet' },
  document: { label: 'Документ', icon: 'documents' },
  question: { label: 'Вопрос', icon: 'questions' },
  file: { label: 'Файл', icon: 'documents' },
  who: { label: 'Кто это?', icon: 'clients' },
};

const DONE_LABEL: Record<Exclude<InboxStatus, 'new'>, string> = { accepted: 'принято', task: 'задача создана', rejected: 'отклонено' };
const DONE_SHOWN = 20;

function when(at: string): string {
  const day = at.slice(0, 10);
  const prefix = day === TODAY ? 'сегодня' : day === addDays(TODAY, -1) ? 'вчера' : fmtDayMonth(day);
  return `${prefix}, ${at.slice(11, 16)}`;
}

/** Одно сообщение с кнопками решения. compact — для блока на «Сегодня». */
export function InboxCard({ it, compact = false }: { it: InboxItem; compact?: boolean }) {
  const store = useStore();
  const ui = useUi();
  const [editing, setEditing] = useState(false);
  const [sum, setSum] = useState(it.amount ? String(it.amount / 100) : '');
  const t = INBOX_TYPE[it.type];
  const can = canWrite('inbox');
  const saving = store.pending.some((p) => p.op.kind === 'decideInbox' && p.op.id === it.id);
  const parsed = parseMoney(sum);
  const decide = (action: 'accept' | 'task' | 'reject', amount?: number) => { store.decideInbox(it.id, action, amount); setEditing(false); };
  return (
    <li className={`inbox__item inbox__item--${it.status}${compact ? ' inbox__item--compact' : ''}`}>
      <div className="inbox__head">
        {it.clientId
          ? <button type="button" className="linklike inbox__who" onClick={() => ui.openClient(it.clientId ?? '')}><Avatar name={it.clientName} /><strong>{it.clientName}</strong></button>
          : <span className="inbox__who"><Avatar name={it.clientName} /><strong>{it.clientName}</strong></span>}
        <span className="tag"><Icon name={t.icon} size={14} />{t.label}</span>
        <span className="sub num">{when(it.at)}</span>
      </div>
      <p className="inbox__snippet">«{it.snippet}»</p>
      {it.status !== 'new' ? (
        <p className="sub inbox__done"><Icon name="check" size={14} />{DONE_LABEL[it.status]}</p>
      ) : saving ? (
        <p className="sub">сохраняется…</p>
      ) : editing ? (
        <form className="inbox__act" onSubmit={(e) => { e.preventDefault(); if (parsed.ok) decide('accept', parsed.kopecks); }}>
          <input className="input input--sm num" value={sum} onChange={(e) => setSum(e.target.value)} inputMode="decimal" aria-label="Сумма, ₴" autoFocus />
          <button type="submit" className="btn btn--primary btn--sm" disabled={!parsed.ok}>Записать {parsed.ok ? formatMoney(parsed.kopecks) : ''}</button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(false)}>Отмена</button>
          {!parsed.ok && sum.trim() && <span className="field__error">{parsed.error}</span>}
        </form>
      ) : (
        <div className="inbox__act">
          {it.type === 'payment' && it.clientId ? (
            <>
              {it.amount
                ? <button type="button" className="btn btn--primary btn--sm" onClick={() => decide('accept')} {...roAttrs('inbox')}>Записать {formatMoney(it.amount)}</button>
                : null}
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => (can ? setEditing(true) : decide('accept'))} {...roAttrs('inbox')}>{it.amount ? 'Изменить сумму' : 'Указать сумму'}</button>
            </>
          ) : it.type !== 'who' && (
            <button type="button" className="btn btn--primary btn--sm" onClick={() => decide('accept')} {...roAttrs('inbox')}>Принято</button>
          )}
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => decide('task')} {...roAttrs('inbox')}>Задача</button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => decide('reject')} {...roAttrs('inbox')}>Нет</button>
        </div>
      )}
    </li>
  );
}

export function Inbox() {
  const store = useStore();
  const fresh = store.inbox.filter((i) => i.status === 'new').sort((a, b) => b.at.localeCompare(a.at));
  const done = store.inbox.filter((i) => i.status !== 'new').sort((a, b) => b.at.localeCompare(a.at));
  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1 className="page__title">Входящие <em>{fresh.length ? `${fresh.length} новых` : 'новых нет'}</em></h1>
          <p className="page__sub">Сообщения клиентов из Telegram. Решите здесь — в таблице появится само; решили в Telegram — здесь отметится.</p>
        </div>
      </header>
      <section className="panel" aria-labelledby="in-new">
        <header className="panel__head"><h2 id="in-new" className="panel__title">Новые</h2></header>
        {fresh.length ? <ul className="inbox">{fresh.map((it) => <InboxCard key={it.id} it={it} />)}</ul>
          : <Empty pic="calm" title="Новых сообщений нет">Когда клиент напишет в Telegram, предложение появится здесь.</Empty>}
      </section>
      {done.length > 0 && (
        <section className="panel" aria-labelledby="in-done">
          <header className="panel__head"><h2 id="in-done" className="panel__title">Решено</h2><span className="sub">{done.length}</span></header>
          <ul className="inbox">{done.slice(0, DONE_SHOWN).map((it) => <InboxCard key={it.id} it={it} />)}</ul>
        </section>
      )}
    </div>
  );
}
