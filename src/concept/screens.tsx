import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CLIENTS, DEADLINES, KEYS, PAYMENTS, QUESTIONS, daysLabel, statusByDays } from './data';
import type { Deadline, Status } from './data';
import {
  IconBack, IconBook, IconCalendar, IconCheck, IconClients, IconCloud, IconKey, IconMore, IconPhone, IconPlus,
  IconQuestion, IconSearch, IconTasks, IconToday, IconWallet,
} from './icons';
import { Stamp } from './Stamp';

export type Screen = 'today' | 'clients' | 'card' | 'deadlines' | 'payment';

const NAV = [
  { id: 'today', label: 'Сегодня', icon: <IconToday /> },
  { id: 'clients', label: 'Клиенты', icon: <IconClients /> },
  { id: 'deadlines', label: 'Сроки', icon: <IconCalendar /> },
  { id: 'payments', label: 'Платежи', icon: <IconWallet /> },
  { id: 'tasks', label: 'Задачи', icon: <IconTasks /> },
  { id: 'keys', label: 'Ключи ЭЦП', icon: <IconKey /> },
  { id: 'reference', label: 'Справочник', icon: <IconBook /> },
] as const;

const PHONE_NAV = ['today', 'clients', 'deadlines', 'payments'] as const;

function activeNav(screen: Screen): string {
  if (screen === 'card') return 'clients';
  if (screen === 'payment') return 'today';
  return screen;
}

/** Русское согласование с числом: 1 срок, 2 срока, 5 сроков. */
function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export function Chip({ status, children }: { status: Status; children: ReactNode }) {
  return <span className={`chip chip--${status}`}>{children}</span>;
}

function SyncNote() {
  return (
    <p className="sync">
      <IconCloud />
      <span>Всё сохранено в таблице, 14:32</span>
    </p>
  );
}

export function Shell({ screen, go, children }: { screen: Screen; go: (s: Screen) => void; children: ReactNode }) {
  const active = activeNav(screen);
  return (
    <div className="shell">
      <nav className="rail" aria-label="Разделы">
        <p className="brand">Сверка</p>
        <ul className="rail__list">
          {NAV.map((n) => (
            <li key={n.id}>
              <a
                href={`?screen=${n.id}`}
                className="rail__item"
                aria-current={active === n.id ? 'page' : undefined}
                onClick={(e) => {
                  if (n.id === 'today' || n.id === 'clients' || n.id === 'deadlines') {
                    e.preventDefault();
                    go(n.id);
                  }
                }}
              >
                {n.icon}
                <span>{n.label}</span>
              </a>
            </li>
          ))}
        </ul>
        <div className="rail__foot">
          <SyncNote />
        </div>
      </nav>

      <main className="main">{children}</main>

      <button type="button" className="fab" onClick={() => go('payment')} aria-keyshortcuts="Alt+N">
        <IconPlus />
        <span className="fab__label">Записать платёж</span>
      </button>

      <nav className="tabbar" aria-label="Разделы">
        {PHONE_NAV.map((id) => {
          const n = NAV.find((x) => x.id === id);
          if (!n) return null;
          return (
            <a key={id} href={`?screen=${id}`} className="tabbar__item" aria-current={active === id ? 'page' : undefined}
              onClick={(e) => {
                if (id !== 'payments') {
                  e.preventDefault();
                  go(id);
                }
              }}>
              {n.icon}
              <span>{n.label}</span>
            </a>
          );
        })}
        <a href="?screen=more" className="tabbar__item">
          <IconMore />
          <span>Ещё</span>
        </a>
      </nav>
    </div>
  );
}

/* ───────── Сегодня ───────── */

function DeadlineRow({ d, compact = false }: { d: Deadline; compact?: boolean }) {
  const st = statusByDays(d.daysLeft);
  return (
    <li className="row">
      <div className="row__main">
        <p className="row__title">{d.client}</p>
        <p className="row__sub">{d.what}{compact ? '' : `, до ${d.due}`}</p>
      </div>
      <div className="row__side">
        {d.amount && <span className="row__amount num">{d.amount}</span>}
        <Chip status={st}>{daysLabel(d.daysLeft)}</Chip>
      </div>
    </li>
  );
}

export function TodayScreen() {
  const burning = DEADLINES.filter((d) => d.daysLeft <= 3);
  const soon = DEADLINES.filter((d) => d.daysLeft > 3 && d.daysLeft <= 7);
  const overdue = burning.filter((d) => d.daysLeft < 0).length;
  return (
    <div className="page">
      <header className="day">
        <p className="day__date">Среда, 14 октября</p>
        <h1 className="day__summary">
          <a href="#burning">{overdue} {plural(overdue, 'срок просрочен', 'срока просрочены', 'сроков просрочено')}</a>, ещё{' '}
          <a href="#burning">{burning.length - overdue} {plural(burning.length - overdue, 'горит', 'горят', 'горят')}</a> до субботы.
          {' '}У <a href="#keys">двоих</a> скоро кончается ключ ЭЦП.
        </h1>
      </header>

      <section id="burning" className="block">
        <h2 className="block__title">Горит</h2>
        <ul className="list">{burning.map((d) => <DeadlineRow key={d.id} d={d} />)}</ul>
      </section>

      <section className="block">
        <h2 className="block__title">Следующие 7 дней</h2>
        <ul className="list">{soon.map((d) => <DeadlineRow key={d.id} d={d} />)}</ul>
      </section>

      <div className="pair">
        <section id="keys" className="block">
          <h2 className="block__title">Ключи ЭЦП, 14 дней</h2>
          <ul className="list">
            {KEYS.map((k) => (
              <li key={k.client} className="row">
                <div className="row__main">
                  <p className="row__title">{k.client}</p>
                  <p className="row__sub">ключ до {k.until}</p>
                </div>
                <div className="row__side"><Chip status={statusByDays(k.daysLeft)}>{daysLabel(k.daysLeft)}</Chip></div>
              </li>
            ))}
          </ul>
        </section>
        <section className="block">
          <h2 className="block__title">Вопросы от Дмитрия</h2>
          <ul className="list">
            {QUESTIONS.map((q) => (
              <li key={q.text} className="row row--question">
                <span className="row__icon"><IconQuestion /></span>
                <div className="row__main">
                  <p className="row__text">{q.text}</p>
                  <p className="row__sub">{q.when}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

/* ───────── Клиенты и карточка ───────── */

function ClientList({ selected, onPick }: { selected?: string; onPick: (id: string) => void }) {
  return (
    <div className="clients">
      <label className="search">
        <IconSearch />
        <span className="visually-hidden">Поиск клиента</span>
        <input type="search" defaultValue="ромашк" placeholder="Фамилия, ІПН или КВЕД" />
        <kbd className="search__key">Ctrl K</kbd>
      </label>
      <p className="hint">Найдено 1 из 116. Ищет в любом падеже, русскими и украинскими буквами.</p>
      <ul className="list list--clients">
        {CLIENTS.map((c) => (
          <li key={c.id}>
            <button type="button" className="row row--button" aria-current={selected === c.id ? 'true' : undefined}
              onClick={() => onPick(c.id)}>
              <span className="row__main">
                <span className="row__title">{c.name}</span>
                <span className="row__sub">{c.kind}</span>
              </span>
              {c.keyDays <= 30 && (
                <span className="row__side"><Chip status={statusByDays(c.keyDays)}>ключ {daysLabel(c.keyDays)}</Chip></span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ClientCard({ onBack }: { onBack: () => void }) {
  const c = CLIENTS[0];
  if (!c) return null;
  const mine = DEADLINES.filter((d) => d.client.startsWith('Ромашко'));
  return (
    <article className="card" aria-labelledby="card-title">
      <button type="button" className="back" onClick={onBack}><IconBack /> Клиенты</button>
      <header className="card__head">
        <h1 id="card-title" className="card__name">{c.name}</h1>
        <p className="card__kind">{c.kind}</p>
        <div className="card__actions">
          <a className="btn btn--soft" href="tel:+380000000001"><IconPhone /> Позвонить</a>
          <button type="button" className="btn btn--soft"><IconPlus /> Платёж</button>
        </div>
      </header>

      <section className="card__section">
        <h2 className="card__h">К уплате в месяц</h2>
        <dl className="taxes">
          {c.taxes.map((t) => (
            <div key={t.name} className="taxes__item">
              <dt>{t.name}</dt>
              <dd className="num">{t.amount}</dd>
              <dd className="taxes__note">{t.note}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="card__section">
        <h2 className="card__h">Сроки</h2>
        <ul className="list">{mine.map((d) => <DeadlineRow key={d.id} d={d} />)}</ul>
      </section>

      <section className="card__section card__facts">
        <div>
          <h2 className="card__h">Ключ ЭЦП</h2>
          <p>до {c.keyUntil} <Chip status={statusByDays(c.keyDays)}>{daysLabel(c.keyDays)}</Chip></p>
        </div>
        <div>
          <h2 className="card__h">КВЕД</h2>
          {c.kved.map((k) => <p key={k}>{k}</p>)}
        </div>
        <div>
          <h2 className="card__h">Пароль от кабинета</h2>
          <button type="button" className="btn btn--quiet">Показать пароль</button>
          <p className="hint">Покажем после подтверждения, на 30 секунд.</p>
        </div>
      </section>
    </article>
  );
}

export function ClientsScreen({ screen, go }: { screen: Screen; go: (s: Screen) => void }) {
  return (
    <div className={`page page--split${screen === 'card' ? ' is-card' : ''}`}>
      <ClientList selected="c1" onPick={() => go('card')} />
      <ClientCard onBack={() => go('clients')} />
    </div>
  );
}

/* ───────── Сроки: календарь + список, закрытие оттиском штампа ───────── */

type SaveState = 'idle' | 'saving' | 'saved';

function MonthGrid() {
  // Октябрь 2026: 1-е — четверг.
  const offset = 3;
  const marks: Record<number, Status> = { 12: 'red', 15: 'orange', 20: 'orange', 26: 'yellow', 30: 'yellow' };
  const cells: (number | null)[] = [...Array<null>(offset).fill(null), ...Array.from({ length: 31 }, (_, i) => i + 1)];
  return (
    <div className="month" aria-label="Октябрь 2026">
      <p className="month__title">Октябрь 2026</p>
      <div className="month__grid" role="grid">
        {['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map((w) => <span key={w} className="month__wd">{w}</span>)}
        {cells.map((d, i) => {
          const mark = d ? marks[d] : undefined;
          return d ? (
            <button key={i} type="button"
              className={`month__day${d === 14 ? ' is-today' : mark ? ` chip--${mark}` : ''}`}
              aria-label={`${d} октября${mark ? ', есть сроки' : ''}`}>
              <span className="num">{d}</span>
            </button>
          ) : <span key={i} />;
        })}
      </div>
    </div>
  );
}

function ClosableRow({ d, onClosed }: { d: Deadline; onClosed: (d: Deadline) => void }) {
  const [phase, setPhase] = useState<'open' | 'stamped' | 'warn'>('open');
  const rowRef = useRef<HTMLLIElement>(null);
  const st = statusByDays(d.daysLeft);

  function close() {
    if (d.periodOpen) {
      setPhase('warn');
      return;
    }
    setPhase('stamped');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Оттиск держится 600 мс — успеть увидеть, что срок закрыт; потом строка уходит в «Закрыто сегодня».
    window.setTimeout(() => {
      const el = rowRef.current;
      if (!el || reduce) return onClosed(d);
      el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(8px)' }], {
        duration: 200, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'forwards',
      }).onfinish = () => onClosed(d);
    }, 600);
  }

  return (
    <li ref={rowRef} className={`row row--deadline${phase === 'stamped' ? ' is-stamped' : ''}`}>
      <div className="row__main">
        <p className="row__title">{d.client}</p>
        <p className="row__sub">{d.what}, до {d.due}</p>
        {d.amount && <p className="row__amount num">{d.amount}</p>}
        {phase === 'warn' && (
          <p className="row__warn" role="status">
            Октябрь ещё не закончился — закрыть этот срок можно с 1 ноября.
          </p>
        )}
      </div>
      <div className="row__side">
        <Chip status={st}>{daysLabel(d.daysLeft)}</Chip>
        <button type="button" className="btn btn--close" onClick={close} disabled={phase === 'stamped'}>
          <IconCheck /> <span className="btn__label">Сдано и оплачено</span>
        </button>
      </div>
      {phase === 'stamped' && <Stamp date="14.10.2026" />}
    </li>
  );
}

export function DeadlinesScreen() {
  const [open, setOpen] = useState(DEADLINES);
  const [closed, setClosed] = useState<{ d: Deadline; save: SaveState }[]>([]);
  const [toast, setToast] = useState<Deadline | null>(null);

  function onClosed(d: Deadline) {
    setOpen((xs) => xs.filter((x) => x.id !== d.id));
    setClosed((xs) => [{ d, save: 'saving' }, ...xs]);
    setToast(d);
    // Макет: «таблица» подтверждает запись через 1,2 с. В прототипе — адаптер с задержкой, отказом и конфликтом.
    window.setTimeout(() => setClosed((xs) => xs.map((x) => (x.d.id === d.id ? { ...x, save: 'saved' } : x))), 1200);
  }

  function undo(d: Deadline) {
    setClosed((xs) => xs.filter((x) => x.d.id !== d.id));
    setOpen((xs) => [...xs, d].sort((a, b) => a.daysLeft - b.daysLeft));
    setToast(null);
  }

  return (
    <div className="page page--deadlines">
      <header className="page__head">
        <h1 className="page__title">Сроки</h1>
        <div className="segmented" role="tablist" aria-label="Вид">
          <button type="button" role="tab" aria-selected="true">Список</button>
          <button type="button" role="tab" aria-selected="false">Месяц</button>
        </div>
      </header>
      <div className="deadlines">
        <MonthGrid />
        <div>
          <section className="block">
            <h2 className="block__title">Открытые</h2>
            <ul className="list">{open.map((d) => <ClosableRow key={d.id} d={d} onClosed={onClosed} />)}</ul>
          </section>
          {closed.length > 0 && (
            <section className="block">
              <h2 className="block__title">Закрыто сегодня</h2>
              <ul className="list">
                {closed.map(({ d, save }) => (
                  <li key={d.id} className="row row--done">
                    <div className="row__main">
                      <p className="row__title">{d.client}</p>
                      <p className="row__sub">{d.what}</p>
                    </div>
                    <div className="row__side">
                      <span className={`save save--${save}`} role="status">
                        {save === 'saving' ? 'сохраняется…' : 'сохранено в таблице'}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
      {toast && <UndoToast key={toast.id} text={`Закрыто: ${toast.client}`} onUndo={() => undo(toast)} onDone={() => setToast(null)} />}
    </div>
  );
}

function UndoToast({ text, onUndo, onDone }: { text: string; onUndo: () => void; onDone: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDone, 10_000);
    return () => window.clearTimeout(t);
  }, [onDone]);
  return (
    <div className="toast" role="status">
      <span>{text}</span>
      <button type="button" className="toast__action" onClick={onUndo}>Отменить</button>
      <span className="toast__timer" aria-hidden="true" />
    </div>
  );
}

/* ───────── Форма платежа ───────── */

export function PaymentScreen({ go }: { go: (s: Screen) => void }) {
  const [amount, setAmount] = useState('1234,5');
  const [period, setPeriod] = useState('Октябрь 2026');
  const [how, setHow] = useState('на счёт');
  const [date, setDate] = useState('14.10.2026');
  return (
    <>
      <TodayScreen />
      <div className="scrim" onClick={() => go('today')} />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="pay-title">
        <span className="sheet__grip" aria-hidden="true" />
        <h2 id="pay-title" className="sheet__title">Записать платёж</h2>
        <form className="form" onSubmit={(e) => e.preventDefault()}>
          <label className="field">
            <span className="field__label">Клиент</span>
            <input className="field__input" defaultValue="Ромашко Олена Петрівна" />
          </label>
          <label className="field">
            <span className="field__label">Сумма</span>
            <span className="field__money">
              <input className="field__input num" inputMode="decimal" value={amount}
                onChange={(e) => setAmount(e.target.value)} onBlur={() => setAmount('1 234,50')} />
              <span className="field__suffix">₴</span>
            </span>
            <span className="field__hint">Можно писать 1234.5 или 1 234,50 — покажем одинаково.</span>
          </label>
          <fieldset className="field">
            <legend className="field__label">За какой период</legend>
            <div className="choices">
              {['Октябрь 2026', 'Сентябрь 2026', 'III квартал 2026', 'Другой…'].map((p) => (
                <button key={p} type="button" className="choice" aria-pressed={period === p} onClick={() => setPeriod(p)}>{p}</button>
              ))}
            </div>
          </fieldset>
          <fieldset className="field">
            <legend className="field__label">Способ</legend>
            <div className="choices">
              {['на счёт', 'наличными', 'на карту'].map((p) => (
                <button key={p} type="button" className="choice" aria-pressed={how === p} onClick={() => setHow(p)}>{p}</button>
              ))}
            </div>
          </fieldset>
          <label className="field">
            <span className="field__label">Дата оплаты</span>
            <input className="field__input num" value={date} onChange={(e) => setDate(e.target.value)} />
            <span className="choices choices--quick">
              {[['сегодня', '14.10.2026'], ['завтра', '15.10.2026'], ['конец месяца', '31.10.2026'], ['20 число', '20.10.2026']].map(([l, v]) => (
                <button key={l} type="button" className="choice choice--small" aria-pressed={date === v} onClick={() => setDate(v ?? '')}>{l}</button>
              ))}
            </span>
          </label>
          <p className="hint">Последний платёж этого клиента: {PAYMENTS[0]?.amount} {PAYMENTS[0]?.what}.</p>
          <div className="form__foot">
            <button type="button" className="btn btn--ghost" onClick={() => go('today')}>Отмена</button>
            <button type="submit" className="btn btn--primary">Записать платёж</button>
          </div>
        </form>
      </div>
    </>
  );
}
