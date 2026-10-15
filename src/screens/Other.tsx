// Ключи ЭЦП, Справочник, Задачи и «Ещё» (телефон). Короче основных экранов, но рабочие.
import { useState } from 'react';
import type { ReactNode } from 'react';
import { canWrite } from '../config';
import { useStore } from '../data/store';
import { TODAY, addDays, daysBetween, daysLabel, fmtDate, plural, statusByDays } from '../lib/dates';
import { parseQuickTask } from '../lib/quickTask';
import type { Client, Priority, Rates, Status, Task } from '../data/types';
import { useKvedSearch, useRates } from '../data/reference';
import { formatMoney } from '../lib/money';
import { Icon } from '../ui/Icon';
import type { IconName } from '../ui/Icon';
import { Avatar, Money, SaveBadge } from '../ui/kit';
import { Empty } from '../ui/Empty';
import { shortName } from '../ui/names';
import { useUi } from '../app/ui-context';
import { TableText } from '../ui/TableText';
import { TaskEdit } from './TaskEdit';
import { useToast } from '../ui/toast';
import { roAttrs, roMessage } from '../ui/readonly';
import { URGENCY_ICON } from './DeadlineTable';
import { Me, SoundSettings, useTheme } from '../app/Shell';

// Группы ключей — шкала словаря (п. 1): просрочен, горит 0–7, скоро 8–30, в порядке; «нет ключа» — ⚪ (п. 3, № 79).
const KEY_GROUPS: { st: Status; title: string }[] = [
  { st: 'red', title: 'Ключ закончился' },
  { st: 'orange', title: 'Горят — 0–7 дней' },
  { st: 'yellow', title: 'Скоро — 8–30 дней' },
  { st: 'green', title: 'В порядке' },
];

function KeyRow({ c }: { c: Client }) {
  const ui = useUi();
  const days = c.keyUntil ? daysBetween(TODAY, c.keyUntil) : null;
  const st: Status = days === null ? 'grey' : statusByDays(days);
  return (
    <li>
      <button type="button" className="keys__row" onClick={() => ui.openClient(c.id)}>
        <Icon name={URGENCY_ICON[st]} size={20} className={`urgency--${st}`} />
        <Avatar name={c.name} />
        <span className="keys__who"><strong>{c.name}</strong><span className="sub">{c.keyIssuer ? <TableText text={c.keyIssuer} size={16} tidy /> : <span className="nil">где выпущен — не указано</span>}</span></span>
        {days === null
          ? <span className="keys__when"><span className="nil">ключа нет в таблице</span></span>
          : <span className="keys__when"><span className={`due--${st}`}>{daysLabel(days).replace('через ', 'ещё ')}</span><span className="sub num">до {fmtDate(c.keyUntil ?? '')}</span></span>}
      </button>
    </li>
  );
}

export function Keys() {
  const store = useStore();
  const withKey = store.clients.filter((c) => c.keyUntil).sort((a, b) => (a.keyUntil ?? '').localeCompare(b.keyUntil ?? ''));
  const noKey = store.clients.filter((c) => !c.keyUntil);
  // Закончились и заканчиваются — разные вещи (п. 4): «7 заканчиваются», когда 4 уже закончились, вводило в заблуждение.
  const gone = withKey.filter((c) => daysBetween(TODAY, c.keyUntil ?? TODAY) < 0).length;
  const soon = withKey.filter((c) => { const d = daysBetween(TODAY, c.keyUntil ?? TODAY); return d >= 0 && d <= 14; }).length;
  // Заголовок — коротко, одной-двумя строками на телефоне (п. 58); что значит «скоро» — в подписи под ним.
  const title = [gone ? `${gone} ${plural(gone, 'закончился', 'закончились', 'закончились')}` : '', soon ? `${soon} скоро` : '']
    .filter(Boolean).join(', ') || 'продлевать пока нечего';
  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1 className="page__title">Ключи ЭЦП <em>{title}</em></h1>
          <p className="page__sub">«Скоро» — кончаются в ближайшие 14 дней. Продлить лучше заранее — бот напомнит.</p>
        </div>
      </header>
      <section className="panel" aria-label="Ключи">
        {KEY_GROUPS.map(({ st, title }) => {
          const list = withKey.filter((c) => statusByDays(daysBetween(TODAY, c.keyUntil ?? TODAY)) === st);
          if (!list.length) return null;
          return (
            <div key={st} className={`dgroup${st === 'red' ? ' dgroup--overdue' : ''}`}>
              <h2 className="dgroup__title"><span>{title}</span><span className="dgroup__count num">{list.length}</span></h2>
              <ul className="keys">{list.map((c) => <KeyRow key={c.id} c={c} />)}</ul>
            </div>
          );
        })}
        {noKey.length > 0 && (
          <div className="dgroup">
            <h2 className="dgroup__title"><span>Ключа нет в таблице</span><span className="dgroup__count num">{noKey.length}</span></h2>
            <ul className="keys">{noKey.map((c) => <KeyRow key={c.id} c={c} />)}</ul>
          </div>
        )}
        {store.clients.length === 0 && <Empty pic="keys" title="Клиентов пока нет" />}
      </section>
    </div>
  );
}

// Ставки и КВЕД — только с сервера (reference.rates / reference.kved, лист «Справочники»). В коде сайта цифр нет:
// неверная ставка на экране бухгалтера опаснее, чем её отсутствие (координатор, 15.10.2026).
const money = (k: number | null) => (k === null ? '—' : formatMoney(k));

function RateCards({ r }: { r: Rates }) {
  const cards: [string, ReactNode, string, IconName][] = [
    ['Минимальная зарплата (МЗП)', <Money text={money(r.mzpKopecks)} />, `с 1 января ${r.year}`, 'salary'],
    ['Прожиточный минимум (ПМ)', <Money text={money(r.pmKopecks)} />, 'для трудоспособных', 'person'],
    ['ЄСВ в месяц', <Money text={money(r.esvMonthlyKopecks)} />, r.esvRatePct !== null ? `${r.esvRatePct} % МЗП` : 'минимальный взнос', 'esv'],
    ...r.groups.map((g): [string, ReactNode, string, IconName] => [
      `ЄП ${g.group} группа`, g.epRule || '—',
      g.limitKopecks !== null ? `доход до ${formatMoney(g.limitKopecks)}${g.limitMzp !== null ? ` (${g.limitMzp} МЗП)` : ''}` : 'предел дохода не указан',
      'taxEp',
    ]),
  ];
  return (
    <section className="rates" aria-label="Ставки">
      {cards.map(([name, value, note, icon]) => (
        <div key={name} className="rate">
          <Icon name={icon} size={22} className="rate__icon" />
          <p className="rate__name">{name}</p>
          <p className="rate__value display">{value}</p>
          <p className="sub">{note}</p>
        </div>
      ))}
    </section>
  );
}

function KvedSearch() {
  const [q, setQ] = useState('');
  const found = useKvedSearch(q);
  return (
    <section className="panel" aria-labelledby="kv-title">
      <header className="panel__head"><h2 id="kv-title" className="panel__title">КВЕД и ставка ЄП</h2></header>
      <div className="toolbar"><label className="search-input"><Icon name="search" /><span className="visually-hidden">Поиск КВЕД</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Код или слово: «47.91», «перукар»" autoComplete="off" spellCheck={false} /></label></div>
      <div aria-live="polite">
        {found.state === 'idle' && <p className="sub panel__note">Наберите хотя бы два знака — поиск идёт по листу «КВЕДы».</p>}
        {found.state === 'loading' && <p className="sub panel__note">Ищу в таблице…</p>}
        {found.state === 'error' && <p className="sub panel__note">{found.message}</p>}
        {found.state === 'ok' && (found.data.items.length ? (
          <ul className="kved kved--table">{found.data.items.map((k) => (
            <li key={k.code}>
              <span className="num kved__code">{k.code}</span>
              <span>{k.title}{k.councilDecision && <span className="sub kved__council">{k.councilDecision}</span>}</span>
              <span className="kved__rates">{Object.entries(k.epByGroup).map(([g, rule]) => <span key={g} className="tag">{g} гр. — {rule}</span>)}</span>
            </li>
          ))}</ul>
        ) : <Empty pic="search" title={`КВЕД «${q.trim()}» в таблице не нашёлся`}>{found.data.note ?? 'Попробуйте код целиком или другое слово.'}</Empty>)}
      </div>
    </section>
  );
}

export function Reference() {
  const rates = useRates();
  const r = rates.state === 'ok' ? rates.data : null;
  return (
    <div className="page">
      <header className="page__head"><div>
        <h1 className="page__title">Справочник{r && r.year ? <> <em>ставки {r.year}</em></> : null}</h1>
        {r && <p className="page__sub">{r.updatedAt ? `Обновлено в таблице ${fmtDate(r.updatedAt.slice(0, 10))}` : 'Из листа «Справочники»'}</p>}
      </div></header>
      {r?.source === 'fallback' && (
        <div className="offline" role="status"><Icon name="warning" /><span><strong>Не из таблицы.</strong> Лист «Справочники» сейчас не читается — это запасные цифры сервера. Сверьте с листом.</span></div>
      )}
      {rates.state === 'loading' && <p className="sub" aria-live="polite">Загружаю ставки из таблицы…</p>}
      {rates.state === 'error' && (
        <section className="panel panel--pad">
          <Empty pic="search" title="Ставки не загрузились" action={<button type="button" className="btn btn--secondary" onClick={rates.retry}>Ещё раз</button>}>{rates.message}</Empty>
        </section>
      )}
      {r && <RateCards r={r} />}
      {r?.limitsSource === 'code' && <p className="sub rates__note">Пределы групп — по закону {r.year || ''}, не из таблицы.</p>}
      <KvedSearch />
    </div>
  );
}

const PRIORITY_LABEL: Record<Priority, string> = { critical: 'Критический', high: 'Высокий', medium: 'Средний', low: 'Низкий' };
const PRIORITY_ICON: Record<Priority, IconName> = { critical: 'critical', high: 'high', medium: 'medium', low: 'low' };

const DONE_SHOWN = 20;

export function Tasks() {
  const store = useStore();
  const ui = useUi();
  const [line, setLine] = useState('');
  const parsed = line.trim() ? parseQuickTask(line, store.clients) : null;
  const client = parsed?.clientId ? store.client(parsed.clientId) : undefined;

  const open = store.tasks.filter((t) => !t.done);
  const [editing, setEditing] = useState<string | null>(null);
  const toast = useToast();
  const edit = (t: Task) => {
    if (!canWrite('tasks')) { toast({ text: roMessage('tasks'), tone: 'info' }); return; }
    if (t.done) { toast({ text: 'Сделанную задачу править нельзя — сначала верните её в работу (снимите галочку)', tone: 'info' }); return; }
    setEditing(t.id);
  };
  const [showDone, setShowDone] = useState(false); // «Сделано» свёрнуто: их десятки (находка «Пользователя» № 29)
  // В снимке — все задачи листа: сделанных бывают сотни, на экране — 20 последних, остальное в таблице.
  const done = store.tasks.filter((t) => t.done);
  const doneShown = done.slice(-DONE_SHOWN);
  const doneHidden = done.length - doneShown.length;
  const groups: [string, Task[]][] = [
    ['Просрочено', open.filter((t) => t.due && t.due < TODAY)],
    ['Сегодня', open.filter((t) => t.due === TODAY)],
    ['Завтра', open.filter((t) => t.due === addDays(TODAY, 1))],
    ['Позже', open.filter((t) => t.due && t.due > addDays(TODAY, 1))],
    ['Без срока', open.filter((t) => !t.due)],
    ['Сделано', doneShown],
  ];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!parsed?.text) return;
    store.addTask({ text: parsed.text, clientId: parsed.clientId, due: parsed.due, priority: parsed.priority, type: parsed.type });
    setLine('');
  }

  return (
    <div className="page">
      <header className="page__head"><div>
        <h1 className="page__title">Задачи <em>{open.length ? `${open.length} ${plural(open.length, 'открыта', 'открыты', 'открыто')}` : 'всё сделано'}</em></h1>
        <p className="page__sub">Звонки, первичка, ключи. Пишите как удобно — клиента и дату пойму сам.</p>
      </div></header>
      <form className="panel quick" onSubmit={submit}>
        <label className="quick__row">
          <span className="quick__plus" aria-hidden="true"><Icon name="plus" /></span>
          <span className="visually-hidden">Новая задача</span>
          <input value={line} onChange={(e) => setLine(e.target.value)} autoComplete="off"
            disabled={!canWrite('tasks')} placeholder={canWrite('tasks') ? 'Например: позвонить Ромашко завтра' : 'Задачи пока — в таблице'} />
          <button type="submit" className="btn btn--primary btn--sm" disabled={!parsed?.text}>Добавить</button>
        </label>
        {parsed && (
          <p className="quick__parsed" aria-live="polite">
            <span className="sub">Понял так:</span>
            <span className="tag">{parsed.text || '…'}</span>
            {client && <span className="tag"><Icon name="fop" size={14} />{shortName(client.name)}</span>}
            {parsed.due && <span className="tag"><Icon name="date" size={14} />{fmtDate(parsed.due)}</span>}
            {parsed.priority !== 'medium' && <span className="tag"><Icon name={PRIORITY_ICON[parsed.priority]} size={14} />{PRIORITY_LABEL[parsed.priority]}</span>}
          </p>
        )}
      </form>
      <section className="panel" aria-label="Список задач">
        {store.tasks.length === 0 && <Empty pic="tasks" title="Задач пока нет">Напишите первую строкой выше.</Empty>}
        {groups.filter(([, xs]) => xs.length).map(([title, xs]) => (
          <div key={title} className={`dgroup${title === 'Просрочено' ? ' dgroup--overdue' : ''}${title === 'Сегодня' ? ' dgroup--today' : ''}`}>
            <h2 className="dgroup__title"><span>{title}</span><span className="dgroup__count num">{title === 'Сделано' ? done.length : xs.length}</span></h2>
            {title === 'Сделано' && !showDone ? (
              <button type="button" className="dgroup__more" onClick={() => setShowDone(true)}>Показать сделанные: {done.length}</button>
            ) : (
            <ul className="tasks">
              {xs.map((t) => {
                const c = t.clientId ? store.client(t.clientId) : undefined;
                const saving = store.pending.some((p) => (p.op.kind === 'createTask' && p.op.task.id === t.id) || (p.op.kind === 'completeTask' && p.op.id === t.id));
                const st = t.due ? statusByDays(daysBetween(TODAY, t.due)) : null;
                return (
                  <li key={t.id} className={`tasks__row${t.done ? ' is-done' : ''}${store.fresh.includes(t.id) ? ' is-fresh' : ''}`}>
                    <button type="button" className="check-btn tasks__check" aria-pressed={t.done} aria-label={`Сделано: ${t.text}`}
                      onClick={() => store.toggleTask(t.id, !t.done)}>
                      <span className="check-btn__ring" aria-hidden="true"><Icon name="check" size={16} /></span>
                    </button>
                    <span className="tasks__text">
                      {t.priority !== 'medium' && !t.done && <Icon name={PRIORITY_ICON[t.priority]} size={18} className={`prio prio--${t.priority}`} label={PRIORITY_LABEL[t.priority]} />}
                      <TableText text={t.text} />
                      {c && <button type="button" className="link tasks__client" onClick={() => ui.openClient(c.id)}>{shortName(c.name)}</button>}
                    </span>
                    {saving ? <SaveBadge state="saving" offline={!store.online} />
                      : t.due && !t.done && st && <span className={`tasks__when due--${st}`}><Icon name={URGENCY_ICON[st]} size={16} className={`urgency--${st}`} />{daysLabel(daysBetween(TODAY, t.due))}</span>}
                    {editing !== t.id && (
                      <button type="button" className="icon-btn tasks__edit" aria-label={`Изменить задачу: ${t.text}`} title="Изменить или удалить"
                        onClick={() => edit(t)} {...roAttrs('tasks')}><Icon name="edited" size={16} /></button>
                    )}
                    {editing === t.id && <TaskEdit t={t} onDone={() => setEditing(null)} />}
                  </li>
                );
              })}
            </ul>
            )}
            {title === 'Сделано' && showDone && doneHidden > 0 && <p className="sub tasks__more">Ещё {doneHidden} {plural(doneHidden, 'сделанная', 'сделанные', 'сделанных')} — в таблице</p>}
          </div>
        ))}
      </section>
    </div>
  );
}

const MORE: [string, IconName, string, string][] = [
  ['#/tasks', 'tasks', 'Задачи', 'звонки, первичка, ключи'],
  ['#/keys', 'key', 'Ключи ЭЦП', 'у кого заканчиваются'],
  ['#/reference', 'book', 'Справочник', 'ставки, КВЕД'],
];

export function More() {
  const [theme, toggleTheme] = useTheme();
  return (
    <div className="page">
      <header className="page__head"><h1 className="page__title">Ещё</h1></header>
      <nav className="panel more" aria-label="Другие разделы">
        {MORE.map(([href, icon, label, hint]) => (
          <a key={href} href={href} className="more__item">
            <Icon name={icon} tile="accent" />
            <span className="more__text"><strong>{label}</strong><span className="sub">{hint}</span></span>
            <Icon name="chevronRight" />
          </a>
        ))}
      </nav>
      {/* На телефоне меню нет — тема, звук и вход здесь (на ноутбуке они внизу меню) */}
      <section className="panel more more--settings" aria-label="Настройки">
        <div className="more__item">
          <Icon name={theme === 'dark' ? 'moon' : 'sun'} tile="accent" />
          <span className="more__text"><strong>Тема</strong><span className="sub">{theme === 'dark' ? 'тёмная' : 'светлая'}</span></span>
          <button type="button" className="btn btn--secondary btn--sm" onClick={toggleTheme}>{theme === 'dark' ? 'Светлая' : 'Тёмная'}</button>
        </div>
        <div className="more__item">
          <Icon name="sound" tile="accent" />
          <span className="more__text"><strong>Звук</strong><span className="sub">только в ответ на ваши действия</span></span>
          <SoundSettings />
        </div>
        <div className="more__item"><Me /></div>
      </section>
    </div>
  );
}
