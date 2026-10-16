// «Входящие»: сообщения клиентов маме из Telegram (бизнес-бот), превращённые в предложения.
// Платёж — «Записать N ₴» / «Изменить сумму» / «Задача» / «Нет»; остальное — «Принято» / «Задача» / «Нет».
// Решено в Telegram — здесь сразу «решено» (сервер присылает upsert).
// Экран — как Telegram (владелец, 16.10): слева чаты по клиенту, справа диалог с пузырями; решения и «вы ответили» —
// служебными строками в ленте. На узком экране список и диалог — два экрана (#/inbox и #/inbox/<чат>).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, RefObject } from 'react';
import { canWrite } from '../config';
import { useStore } from '../data/store';
import type { InboxItem, InboxStatus, InboxType } from '../data/types';
import type { InboxAction } from '../data/api';
import { TODAY, addDays, fmtDayMonth } from '../lib/dates';
import { useRoute } from '../router';
import { groupThreads } from '../lib/inboxThreads';
import type { Thread } from '../lib/inboxThreads';
import { markRead, useReadAt } from '../data/inboxRead';
import { formatMoney, parseMoney } from '../lib/money';
import { Icon } from '../ui/Icon';
import type { IconName } from '../ui/Icon';
import { Avatar } from '../ui/kit';
import { clientPhoto } from '../ui/photo';
import { Empty } from '../ui/Empty';
import { roAttrs } from '../ui/readonly';
import { shortName } from '../ui/names';
import { useUi } from '../app/ui-context';
import { HOLD_MS } from '../data/store';
import { useToast } from '../ui/toast';
import { telegramLink } from '../lib/contact';

/** accept — главная кнопка, как в боте: у платежа — «Записать», у остальных сервер ставит задачу своего вида. */
export const INBOX_TYPE: Record<InboxType, { label: string; icon: IconName; accept: string }> = {
  payment: { label: 'Платёж', icon: 'wallet', accept: 'Записать' },
  tax: { label: 'Налог', icon: 'taxPay', accept: 'Принято' },
  order: { label: 'Поручение', icon: 'transfer', accept: 'В задачи: оплатить' },
  document: { label: 'Документ', icon: 'documents', accept: 'Принято' },
  question: { label: 'Вопрос', icon: 'questions', accept: 'В задачи: ответить' },
  voice: { label: 'Голосовое', icon: 'mic', accept: 'В задачи: ответить' },
  file: { label: 'Файл', icon: 'documents', accept: 'Принято' },
};

const DONE_LABEL: Record<Exclude<InboxStatus, 'new'>, string> = { accepted: 'принято', task: 'задача создана', rejected: 'отклонено' };
const MIN_KOPECKS = 5000; // сервер (v5.72): сумма платежа не меньше 50 ₴

function when(at: string): string {
  const day = at.slice(0, 10);
  const prefix = day === TODAY ? 'сегодня' : day === addDays(TODAY, -1) ? 'вчера' : fmtDayMonth(day);
  return `${prefix}, ${at.slice(11, 16)}`;
}

const hhmm = (at: string) => at.slice(11, 16);

/** Кнопки решения по одному сообщению — общие для «Сегодня» и диалога. */
function InboxActions({ it }: { it: InboxItem }) {
  const store = useStore();
  const [editing, setEditing] = useState(false);
  const [taskPick, setTaskPick] = useState(false);
  const [sum, setSum] = useState(it.amount ? String(it.amount / 100) : '');
  const can = canWrite('inbox');
  const saving = store.pending.some((p) => p.op.kind === 'decideInbox' && p.op.id === it.id);
  const parsed = parseMoney(sum);
  const tooSmall = parsed.ok && parsed.kopecks < MIN_KOPECKS;
  const acceptIsTask = it.type !== 'payment' && it.clientId !== null && INBOX_TYPE[it.type].accept.startsWith('В задачи');
  const toast = useToast();
  const decide = (action: InboxAction, amount?: number) => {
    const rid = store.decideInbox(it.id, action, amount);
    setEditing(false);
    // «Нет» — 10 с на «Отменить», клиенту при этом ничего не уходит (находка «Пользователя» № 15).
    if (action === 'reject' && can) {
      toast({ text: `Скрыто: ${it.clientName} — клиенту ничего не отправим`, tone: 'info', timeout: HOLD_MS, action: { label: 'Отменить', run: () => {
        void store.undoHeld(rid).then((ok) => { if (!ok) toast({ text: 'Уже записано в таблицу — сообщение остаётся в «Решено»', tone: 'info' }); });
      } } });
    }
  };
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
        <button type="button" className="btn btn--primary btn--sm" onClick={() => decide('accept')} {...roAttrs('inbox')}>{INBOX_TYPE[it.type].accept}</button>
      )}
      {/* Одна «Задача» (находка № 16): если в сообщении есть налог — выбор вида тут же, а не вторая кнопка рядом */}
      {it.taxKopecks && taskPick ? (
        <span className="inbox__pick" role="group" aria-label="Какую задачу создать">
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => decide('task')} {...roAttrs('inbox')}>Обычная задача</button>
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => decide('taxTask')} {...roAttrs('inbox')}>По налогу {formatMoney(it.taxKopecks)}</button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setTaskPick(false)}>Отмена</button>
        </span>
      ) : acceptIsTask ? null : (
        // № 21 (проход 2): если главная кнопка уже «В задачи: …» — второй «Задачи» рядом нет, способ один
        <button type="button" className="btn btn--secondary btn--sm" aria-expanded={it.taxKopecks ? false : undefined}
          onClick={() => (it.taxKopecks ? setTaskPick(true) : decide('task'))} {...roAttrs('inbox')}>Задача</button>
      )}
      {/* «Нет» читалось как «откажем клиенту» (находка № 14) — это просто «не нужно, скрыть»; клиенту ничего не уходит */}
      {!taskPick && <button type="button" className="btn btn--ghost btn--sm" title="Скрыть — клиенту ничего не отправим" onClick={() => decide('reject')} {...roAttrs('inbox')}>Не нужно</button>}
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
      {voiceText(it) !== null
        ? <p className="inbox__snippet inbox__voice"><Icon name="mic" size={16} />{voiceText(it) || 'Голосовое — послушать в Telegram'}</p>
        : <p className="inbox__snippet">«{it.snippet}»</p>}
      {it.type === 'order' && it.amount ? <p className="sub inbox__tax">Оплатить за клиента: {formatMoney(it.amount)}</p> : null}
      {it.taxKopecks ? <p className="sub inbox__tax">В сообщении и налог: {formatMoney(it.taxKopecks)}</p> : null}
      {it.status !== 'new'
        ? <p className="sub inbox__done"><Icon name="check" size={14} />{DONE_LABEL[it.status]}</p>
        : <InboxActions it={it} />}
    </li>
  );
}

// ═════════ Чаты ═════════

/** Время в списке чатов — как в Telegram: сегодня — часы, вчера — «вчера», раньше — дата. */
function listTime(at: string): string {
  const day = at.slice(0, 10);
  return day === TODAY ? hhmm(at) : day === addDays(TODAY, -1) ? 'вчера' : fmtDayMonth(day);
}

const dayTitle = (day: string) => (day === TODAY ? 'Сегодня' : day === addDays(TODAY, -1) ? 'Вчера' : fmtDayMonth(day));

/** Служебная строка решения в ленте: «Записано в платежи · 1 200,00 ₴ · 09:14». */
function doneText(it: InboxItem): string {
  const what = it.status === 'accepted'
    ? (it.type === 'payment' ? `Записано в платежи${it.amount ? ` · ${formatMoney(it.amount)}` : ''}` : 'Принято')
    : it.status === 'task' ? 'Задача создана' : 'Отклонено';
  return it.decidedAt ? `${what} · ${hhmm(it.decidedAt)}` : what;
}

/** Голосовое: текст без «🎤» в начале (эмодзи в строках сайта не показываем — свой значок). null — не голосовое. */
function voiceText(it: InboxItem): string | null {
  if (it.type !== 'voice') return null;
  const t = it.snippet.replace(/^\p{Extended_Pictographic}️?\s*/u, '').trim();
  return t === '…' || t === '...' ? '' : t;
}

function Bubble({ it, i }: { it: InboxItem; i: number }) {
  const t = INBOX_TYPE[it.type];
  return (
    <li className={`bubble${it.status === 'new' ? ' is-new' : ''}`} style={{ '--i': i } as CSSProperties}>
      <div className="bubble__box">
        <span className="bubble__type"><Icon name={t.icon} size={14} />{t.label}</span>
        {voiceText(it) !== null
          ? <p className="bubble__voice"><Icon name="mic" size={18} /><span>{voiceText(it) || 'Голосовое — послушать в Telegram'}</span></p>
          : <p className="bubble__text">{it.snippet}</p>}
        {it.type === 'order' && it.amount ? <p className="bubble__order">Оплатить за клиента: <span className="num">{formatMoney(it.amount)}</span></p> : null}
        {it.file && <span className="bubble__file"><Icon name="attach" size={16} />файл приложен — открыть можно в Telegram</span>}
        {it.taxKopecks ? <p className="bubble__tax">В сообщении и налог: <span className="num">{formatMoney(it.taxKopecks)}</span></p> : null}
        <time className="bubble__time num" dateTime={it.at}>{hhmm(it.at)}</time>
      </div>
      {it.status === 'new' && <InboxActions it={it} />}
    </li>
  );
}

function Dialog({ chat, visible }: { chat: Thread; visible: boolean }) {
  const ui = useUi();
  const store = useStore();
  // Ответить клиенту с сайта нельзя, пока сервер не дал inbox.reply — открываем его чат в Telegram по телефону из карточки
  // (находка «Пользователя» № 22). Телефона нет — просто Telegram.
  const tg = telegramLink(chat.clientId ? store.client(chat.clientId)?.phone : null);
  const feed = useRef<HTMLOListElement>(null);
  // Открыт и виден — прочитан до последнего сообщения (счётчик в списке гаснет), как в Telegram.
  useEffect(() => { if (visible) markRead(chat.key, chat.last.at); }, [visible, chat.key, chat.last.at]);
  // Открыли чат — лента внизу, у последнего сообщения (как в Telegram), если у неё своя прокрутка.
  // Мгновенно (behavior 'instant'), даже если стили ленты зададут scroll-behavior: smooth: плавный прокрут 0,5–1 с при
  // открытии перебивал колесо мамы (замер дизайна 16.10: на 500 мс — 3 из 3 «не крутится»).
  useLayoutEffect(() => { const el = feed.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'instant' }); }, [chat.key]);
  // По дням: у каждого дня своя группа — плашка даты прилипает сверху только в пределах своего дня, следующий день
  // её выталкивает (как в Telegram), а не ложится поверх.
  const days: { day: string; rows: ReactNode[] }[] = [];
  chat.items.forEach((it, i) => {
    const d = it.at.slice(0, 10);
    let g = days[days.length - 1];
    if (!g || g.day !== d) { g = { day: d, rows: [] }; days.push(g); }
    g.rows.push(<Bubble key={it.id} it={it} i={i} />);
    if (it.status !== 'new') g.rows.push(<li key={`s-${it.id}`} className="dfeed__service"><Icon name="check" size={14} />{doneText(it)}</li>);
    if (it.repliedAt) g.rows.push(<li key={`r-${it.id}`} className="dfeed__service"><Icon name="message" size={14} />Вы ответили в Telegram · {hhmm(it.repliedAt)}</li>);
  });
  return (
    <section className="dialog" aria-label={`Переписка: ${chat.name}`}>
      <header className="dialog__head">
        <a href="#/inbox" className="icon-btn dialog__back" aria-label="Назад к чатам"><Icon name="chevronLeft" /></a>
        <Avatar name={chat.name} {...(chat.clientId ? { clientId: chat.clientId } : {})} photo={clientPhoto(chat.clientId ? store.client(chat.clientId) : null)} />
        <div className="dialog__who">
          {chat.clientId
            ? <button type="button" className="linklike dialog__name" onClick={() => ui.openClient(chat.clientId ?? '')} title="Открыть карточку клиента">{chat.name}</button>
            : <strong className="dialog__name">{chat.name}</strong>}
          <span className="sub">{chat.open ? `ждут решения: ${chat.open}` : 'всё решено'}{chat.clientId ? '' : ' · номера нет в таблице'}</span>
        </div>
        <a className="btn btn--secondary btn--sm dialog__tg" href={tg ?? 'https://web.telegram.org/'} target="_blank" rel="noopener noreferrer"
          aria-label={tg ? 'Ответить в Telegram' : 'Открыть Telegram'}
          title={tg ? 'Откроет чат с клиентом в Telegram по телефону из карточки' : 'Телефона клиента нет в таблице — откроется Telegram'}>
          <Icon name="reply" size={16} /><span className="dialog__tg-text">{tg ? 'Ответить' : 'Открыть'}<span className="dialog__tg-more">{tg ? ' в Telegram' : ' Telegram'}</span></span></a>
      </header>
      <ol ref={feed} className="dfeed" key={chat.key}>
        {days.map((g) => (
          <li key={g.day} className="dfeed__group">
            <p className="dfeed__day"><span>{dayTitle(g.day)}</span></p>
            <ol className="dfeed__items">{g.rows}</ol>
          </li>
        ))}
        {/* Тихая отметка конца: видно, что ниже ничего нет (повторная приёмка 16.10, Г-7) */}
        <li className="dfeed__end" aria-hidden="true">Это последнее сообщение</li>
      </ol>
    </section>
  );
}

/** Две колонки (≥ 900px, как в CSS): справа диалог виден и без адреса. */
function useWide(): boolean {
  const q = '(min-width: 900px)';
  const [wide, setWide] = useState(() => window.matchMedia?.(q).matches ?? true);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return;
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

/** Блок чатов — от своего верха до низа окна: плашки и шапка над ним бывают разной высоты, а кнопки последнего
 *  сообщения должны быть видны без прокрутки страницы (Г-7: низ ленты был на 846 px при окне 800). */
function useFitToWindow(ref: RefObject<HTMLElement | null>, on: boolean): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !on) return;
    const fit = () => el.style.setProperty('--chats-top', `${Math.round(el.getBoundingClientRect().top + window.scrollY)}px`);
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [ref, on]);
}

export function Inbox() {
  const store = useStore();
  const chatsRef = useRef<HTMLDivElement>(null);
  const route = useRoute();
  const readAt = useReadAt();
  const chats = groupThreads(store.inbox, readAt);
  const wide = useWide();
  const fresh = store.inbox.filter((i) => i.status === 'new').length;
  const want = route.params[0];
  // Открытый чат — из адреса; на широком экране без адреса показан первый (на узком тогда виден только список).
  const open = chats.find((c) => c.key === want) ?? null;
  const shown = open ?? chats[0] ?? null;
  useFitToWindow(chatsRef, wide && chats.length > 0);
  return (
    <div className="page">
      <header className="page__head">
        <div>
          {/* Одно число везде — «ждут решения» (статус «новое»): в меню, в заголовке и у чата (находка № 20).
              Непрочитанное видно по жирному имени чата, отдельным числом не считается. */}
          <h1 className="page__title">Входящие <em>{fresh ? `ждут решения: ${fresh}` : 'всё решено'}</em></h1>
          <p className="page__sub">Сообщения клиентов из Telegram. Решите здесь — в таблице появится само; решили в Telegram — здесь отметится.</p>
        </div>
      </header>
      {chats.length ? (
        <div ref={chatsRef} className={`panel chats${open ? ' has-open' : ''}`}>
          <nav className="chats__list" aria-label="Чаты с клиентами">
            <ul>
              {chats.map((c) => (
                <li key={c.key}>
                  <a href={`#/inbox/${encodeURIComponent(c.key)}`} className={`chat${c.unread ? ' has-unread' : ''}`} aria-current={shown?.key === c.key ? 'true' : undefined}>
                    <Avatar name={c.name} {...(c.clientId ? { clientId: c.clientId } : {})} photo={clientPhoto(c.clientId ? store.client(c.clientId) : null)} />
                    <span className="chat__top"><strong className="chat__name">{c.clientId ? shortName(c.name) : c.name}</strong><span className="chat__time num">{listTime(c.last.at)}</span></span>
                    <span className="chat__bottom">
                      <span className="chat__snippet">{c.last.file && <Icon name="attach" size={14} />}{voiceText(c.last) !== null ? <><Icon name="mic" size={14} />{voiceText(c.last) || 'Голосовое'}</> : c.last.snippet}</span>
                      {c.open > 0 && <span className="chat__badge num" title="Ждут решения" aria-label={`ждут решения: ${c.open}`}>{c.open}</span>}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          {shown && <Dialog chat={shown} visible={wide || open !== null} />}
        </div>
      ) : (
        <section className="panel"><Empty pic="calm" title="Сообщений пока нет">Когда клиент напишет в Telegram, переписка появится здесь.</Empty></section>
      )}
    </div>
  );
}
