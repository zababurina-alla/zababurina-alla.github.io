// «Входящие»: сообщения клиентов маме из Telegram (бизнес-бот), превращённые в предложения.
// Платёж — «Записать N ₴» / «Изменить сумму» / «Задача» / «Нет»; остальное — «Принято» / «Задача» / «Нет».
// Решено в Telegram — здесь сразу «решено» (сервер присылает upsert).
// Экран — как Telegram (владелец, 16.10): слева чаты по клиенту, справа диалог с пузырями; решения и «вы ответили» —
// служебными строками в ленте. На узком экране список и диалог — два экрана (#/inbox и #/inbox/<чат>).
import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { canWrite } from '../config';
import { useStore } from '../data/store';
import type { InboxItem, InboxStatus, InboxType } from '../data/types';
import type { InboxAction } from '../data/api';
import { TODAY, addDays, fmtDayMonth } from '../lib/dates';
import { useRoute } from '../router';
import { formatMoney, parseMoney } from '../lib/money';
import { Icon } from '../ui/Icon';
import type { IconName } from '../ui/Icon';
import { Avatar } from '../ui/kit';
import { Empty } from '../ui/Empty';
import { roAttrs } from '../ui/readonly';
import { shortName } from '../ui/names';
import { useUi } from '../app/ui-context';

export const INBOX_TYPE: Record<InboxType, { label: string; icon: IconName }> = {
  payment: { label: 'Платёж', icon: 'wallet' },
  document: { label: 'Документ', icon: 'documents' },
  question: { label: 'Вопрос', icon: 'questions' },
  file: { label: 'Файл', icon: 'documents' },
};

const DONE_LABEL: Record<Exclude<InboxStatus, 'new'>, string> = { accepted: 'принято', task: 'задача создана', rejected: 'отклонено' };
const MIN_KOPECKS = 5000; // сервер (v5.72): сумма платежа не меньше 50 ₴

function when(at: string): string {
  const day = at.slice(0, 10);
  const prefix = day === TODAY ? 'сегодня' : day === addDays(TODAY, -1) ? 'вчера' : fmtDayMonth(day);
  return `${prefix}, ${at.slice(11, 16)}`;
}

/** Поля техники, запрошены 16.10: когда решено и когда мама ответила в Telegram. Нет поля — строки без времени / нет. */
type Item = InboxItem & { decidedAt?: string | null; repliedAt?: string | null };

const hhmm = (at: string) => at.slice(11, 16);

/** Кнопки решения по одному сообщению — общие для «Сегодня» и диалога. */
function InboxActions({ it }: { it: InboxItem }) {
  const store = useStore();
  const [editing, setEditing] = useState(false);
  const [sum, setSum] = useState(it.amount ? String(it.amount / 100) : '');
  const can = canWrite('inbox');
  const saving = store.pending.some((p) => p.op.kind === 'decideInbox' && p.op.id === it.id);
  const parsed = parseMoney(sum);
  const tooSmall = parsed.ok && parsed.kopecks < MIN_KOPECKS;
  const decide = (action: InboxAction, amount?: number) => { store.decideInbox(it.id, action, amount); setEditing(false); };
  if (saving) return <p className="sub">сохраняется…</p>;
  if (editing) {
    return (
      <form className="inbox__act" onSubmit={(e) => { e.preventDefault(); if (parsed.ok && !tooSmall) decide('accept', parsed.kopecks); }}>
        <input className="input input--sm num" value={sum} onChange={(e) => setSum(e.target.value)} inputMode="decimal" aria-label="Сумма, ₴" autoFocus />
        <button type="submit" className="btn btn--primary btn--sm" disabled={!parsed.ok || tooSmall}>Записать {parsed.ok ? formatMoney(parsed.kopecks) : ''}</button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(false)}>Отмена</button>
        {!parsed.ok && sum.trim() && <span className="field__error">{parsed.error}</span>}
        {tooSmall && <span className="field__error">Сумма меньше 50 ₴ — проверьте</span>}
      </form>
    );
  }
  return (
    <div className="inbox__act">
      {it.type === 'payment' && it.clientId ? (
        <>
          {it.amount
            ? <button type="button" className="btn btn--primary btn--sm" onClick={() => decide('accept')} {...roAttrs('inbox')}>Записать {formatMoney(it.amount)}</button>
            : null}
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => (can ? setEditing(true) : decide('accept'))} {...roAttrs('inbox')}>{it.amount ? 'Изменить сумму' : 'Указать сумму'}</button>
        </>
      ) : it.clientId && (
        <button type="button" className="btn btn--primary btn--sm" onClick={() => decide('accept')} {...roAttrs('inbox')}>Принято</button>
      )}
      {it.taxKopecks ? <button type="button" className="btn btn--secondary btn--sm" onClick={() => decide('taxTask')} {...roAttrs('inbox')}>Задача по налогу</button> : null}
      <button type="button" className="btn btn--secondary btn--sm" onClick={() => decide('task')} {...roAttrs('inbox')}>Задача</button>
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => decide('reject')} {...roAttrs('inbox')}>Нет</button>
    </div>
  );
}

/** Одно сообщение с кнопками решения. compact — для блока на «Сегодня». */
export function InboxCard({ it, compact = false }: { it: InboxItem; compact?: boolean }) {
  const ui = useUi();
  const t = INBOX_TYPE[it.type];
  return (
    <li className={`inbox__item inbox__item--${it.status}${compact ? ' inbox__item--compact' : ''}`}>
      <div className="inbox__head">
        {it.clientId
          ? <button type="button" className="linklike inbox__who" onClick={() => ui.openClient(it.clientId ?? '')}><Avatar name={it.clientName} /><strong>{it.clientName}</strong></button>
          : <span className="inbox__who"><Avatar name={it.clientName} /><strong>{it.clientName}</strong></span>}
        <span className="tag"><Icon name={t.icon} size={14} />{t.label}</span>
        <span className="sub num">{when(it.at)}</span>
        {it.file && <span className="tag inbox__file" title="К сообщению приложен файл — он в Telegram"><Icon name="attach" size={14} />файл</span>}
      </div>
      <p className="inbox__snippet">«{it.snippet}»</p>
      {it.taxKopecks ? <p className="sub inbox__tax">В сообщении и налог: {formatMoney(it.taxKopecks)}</p> : null}
      {it.status !== 'new'
        ? <p className="sub inbox__done"><Icon name="check" size={14} />{DONE_LABEL[it.status]}</p>
        : <InboxActions it={it} />}
    </li>
  );
}

// ═════════ Чаты ═════════

interface Chat { key: string; clientId: string | null; name: string; items: Item[]; last: Item; unread: number }

/** Чат — по клиенту; неизвестный номер (клиента нет) — свой чат по имени. */
export const chatKey = (it: InboxItem) => it.clientId ?? `n:${it.clientName}`;

function groupChats(items: Item[]): Chat[] {
  const by = new Map<string, Item[]>();
  for (const it of items) by.set(chatKey(it), [...(by.get(chatKey(it)) ?? []), it]);
  return [...by.entries()].map(([key, xs]) => {
    const sorted = [...xs].sort((a, b) => a.at.localeCompare(b.at));
    const last = sorted[sorted.length - 1] as Item;
    return { key, clientId: last.clientId, name: last.clientName, items: sorted, last, unread: sorted.filter((x) => x.status === 'new').length };
  }).sort((a, b) => b.last.at.localeCompare(a.last.at));
}

/** Время в списке чатов — как в Telegram: сегодня — часы, вчера — «вчера», раньше — дата. */
function listTime(at: string): string {
  const day = at.slice(0, 10);
  return day === TODAY ? hhmm(at) : day === addDays(TODAY, -1) ? 'вчера' : fmtDayMonth(day);
}

const dayTitle = (day: string) => (day === TODAY ? 'Сегодня' : day === addDays(TODAY, -1) ? 'Вчера' : fmtDayMonth(day));

/** Служебная строка решения в ленте: «Записано в платежи · 1 200,00 ₴ · 09:14». */
function doneText(it: Item): string {
  const what = it.status === 'accepted'
    ? (it.type === 'payment' ? `Записано в платежи${it.amount ? ` · ${formatMoney(it.amount)}` : ''}` : 'Принято')
    : it.status === 'task' ? 'Задача создана' : 'Отклонено';
  return it.decidedAt ? `${what} · ${hhmm(it.decidedAt)}` : what;
}

function Bubble({ it, i }: { it: Item; i: number }) {
  const t = INBOX_TYPE[it.type];
  return (
    <li className={`bubble${it.status === 'new' ? ' is-new' : ''}`} style={{ '--i': i } as CSSProperties}>
      <div className="bubble__box">
        <span className="bubble__type"><Icon name={t.icon} size={14} />{t.label}</span>
        <p className="bubble__text">{it.snippet}</p>
        {it.file && <span className="bubble__file"><Icon name="attach" size={16} />Файл — в Telegram</span>}
        {it.taxKopecks ? <p className="bubble__tax">В сообщении и налог: <span className="num">{formatMoney(it.taxKopecks)}</span></p> : null}
        <time className="bubble__time num" dateTime={it.at}>{hhmm(it.at)}</time>
      </div>
      {it.status === 'new' && <InboxActions it={it} />}
    </li>
  );
}

function Dialog({ chat }: { chat: Chat }) {
  const ui = useUi();
  const feed = useRef<HTMLOListElement>(null);
  // Открыли чат — лента внизу, у последнего сообщения (как в Telegram), если у неё своя прокрутка.
  useLayoutEffect(() => { const el = feed.current; if (el) el.scrollTop = el.scrollHeight; }, [chat.key]);
  const rows: ReactNode[] = [];
  let day = '';
  chat.items.forEach((it, i) => {
    const d = it.at.slice(0, 10);
    if (d !== day) { day = d; rows.push(<li key={`d-${d}`} className="feed__day"><span>{dayTitle(d)}</span></li>); }
    rows.push(<Bubble key={it.id} it={it} i={i} />);
    if (it.status !== 'new') rows.push(<li key={`s-${it.id}`} className="feed__service"><Icon name="check" size={14} />{doneText(it)}</li>);
    if (it.repliedAt) rows.push(<li key={`r-${it.id}`} className="feed__service"><Icon name="message" size={14} />Вы ответили в Telegram · {hhmm(it.repliedAt)}</li>);
  });
  return (
    <section className="dialog" aria-label={`Переписка: ${chat.name}`}>
      <header className="dialog__head">
        <a href="#/inbox" className="icon-btn dialog__back" aria-label="Назад к чатам"><Icon name="chevronLeft" /></a>
        <Avatar name={chat.name} {...(chat.clientId ? { clientId: chat.clientId } : {})} />
        <div className="dialog__who">
          {chat.clientId
            ? <button type="button" className="linklike dialog__name" onClick={() => ui.openClient(chat.clientId ?? '')} title="Открыть карточку клиента">{chat.name}</button>
            : <strong className="dialog__name">{chat.name}</strong>}
          <span className="sub">{chat.unread ? `ждут решения: ${chat.unread}` : 'всё решено'}{chat.clientId ? '' : ' · номера нет в таблице'}</span>
        </div>
      </header>
      <ol ref={feed} className="feed" key={chat.key}>{rows}</ol>
    </section>
  );
}

export function Inbox() {
  const store = useStore();
  const route = useRoute();
  const chats = groupChats(store.inbox as Item[]);
  const fresh = store.inbox.filter((i) => i.status === 'new').length;
  const want = route.params[0];
  // Открытый чат — из адреса; на широком экране без адреса показан первый (на узком тогда виден только список).
  const open = chats.find((c) => c.key === want) ?? null;
  const shown = open ?? chats[0] ?? null;
  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1 className="page__title">Входящие <em>{fresh ? `${fresh} новых` : 'новых нет'}</em></h1>
          <p className="page__sub">Сообщения клиентов из Telegram. Решите здесь — в таблице появится само; решили в Telegram — здесь отметится.</p>
        </div>
      </header>
      {chats.length ? (
        <div className={`panel chats${open ? ' has-open' : ''}`}>
          <nav className="chats__list" aria-label="Чаты с клиентами">
            <ul>
              {chats.map((c) => (
                <li key={c.key}>
                  <a href={`#/inbox/${encodeURIComponent(c.key)}`} className={`chat${c.unread ? ' has-unread' : ''}`} aria-current={shown?.key === c.key ? 'true' : undefined}>
                    <Avatar name={c.name} {...(c.clientId ? { clientId: c.clientId } : {})} />
                    <span className="chat__top"><strong className="chat__name">{c.clientId ? shortName(c.name) : c.name}</strong><span className="chat__time num">{listTime(c.last.at)}</span></span>
                    <span className="chat__bottom">
                      <span className="chat__snippet">{c.last.file && <Icon name="attach" size={14} />}{c.last.snippet}</span>
                      {c.unread > 0 && <span className="chat__badge num" aria-label={`новых: ${c.unread}`}>{c.unread}</span>}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          {shown && <Dialog chat={shown} />}
        </div>
      ) : (
        <section className="panel"><Empty pic="calm" title="Сообщений пока нет">Когда клиент напишет в Telegram, переписка появится здесь.</Empty></section>
      )}
    </div>
  );
}
