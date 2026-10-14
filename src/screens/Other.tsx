// Ключи ЭЦП, Справочник, Задачи и «Ещё» (телефон). Короче основных экранов, но рабочие.
import { useState } from 'react';
import { canWrite } from '../config';
import { useStore } from '../data/store';
import { TODAY, addDays, daysBetween, daysLabel, fmtDate, statusByDays } from '../lib/dates';
import { parseQuickTask } from '../lib/quickTask';
import type { Priority, Task } from '../data/types';
import { formatMoney } from '../lib/money';
import { fold } from '../lib/search';
import { Icon } from '../ui/Icon';
import type { IconName } from '../ui/Icon';
import { Avatar, SaveBadge, StatusPill } from '../ui/kit';
import { useUi } from '../app/ui-context';

export function Keys() {
  const store = useStore();
  const ui = useUi();
  const list = store.clients.filter((c) => c.keyUntil).sort((a, b) => (a.keyUntil ?? '').localeCompare(b.keyUntil ?? ''));
  return (
    <div className="page">
      <header className="page__head"><div><h1 className="page__title">Ключи ЭЦП</h1><p className="page__sub">По дате окончания. Продлить лучше за 14 дней.</p></div></header>
      <section className="panel" aria-label="Ключи">
        <ul className="keys">
          {list.map((c) => {
            const days = daysBetween(TODAY, c.keyUntil ?? TODAY);
            return (
              <li key={c.id}>
                <button type="button" className="keys__row" onClick={() => ui.openClient(c.id)}>
                  <Avatar name={c.name} />
                  <span className="keys__who"><strong>{c.name}</strong><span className="sub num">до {fmtDate(c.keyUntil ?? '')}</span></span>
                  <StatusPill status={statusByDays(days)}>{daysLabel(days)}</StatusPill>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

// Ставки 2026 — из брифа (МЗП 8 647, ПМ 3 328, ЄСВ 1 902,34). На живых данных — из справочника API, не из кода.
const RATES: [string, number, string][] = [
  ['Минимальная зарплата (МЗП)', 864700, 'с 1 января 2026'],
  ['Прожиточный минимум (ПМ)', 332800, 'для трудоспособных'],
  ['ЄСВ в месяц', 190234, '22 % МЗП'],
  ['ЄП 1 группа в месяц', 33280, 'до 10 % ПМ'],
  ['ЄП 2 группа в месяц', 172940, 'до 20 % МЗП'],
];

const KVED_RATES: [string, string, string][] = [
  ['96.02', 'Перукарні та салони краси', '2 гр. — 20 % МЗП'],
  ['47.91', 'Торгівля через інтернет', '2 гр. — 20 % МЗП'],
  ['47.81', 'Торгівля з лотків продуктами', '1 гр. — 10 % ПМ'],
  ['56.10', 'Ресторани', '2 гр. — 20 % МЗП'],
  ['45.20', 'Ремонт автомобілів', '2 гр. — 20 % МЗП'],
];

export function Reference() {
  const [q, setQ] = useState('');
  const kv = KVED_RATES.filter(([code, title]) => !q || code.startsWith(q) || fold(title).includes(fold(q)));
  return (
    <div className="page">
      <header className="page__head"><div><h1 className="page__title">Справочник</h1><p className="page__sub">Ставки 2026 года. Обновлено в таблице 02.01.2026 (пример).</p></div></header>
      <section className="rates" aria-label="Ставки">
        {RATES.map(([name, k, note]) => (
          <div key={name} className="panel panel--pad rate"><p className="kpi__label">{name}</p><p className="kpi__value kpi__value--md num">{formatMoney(k)}</p><p className="sub">{note}</p></div>
        ))}
      </section>
      <section className="panel" aria-labelledby="kv-title">
        <header className="panel__head"><h2 id="kv-title" className="panel__title">КВЕД и ставка ЄП</h2></header>
        <div className="toolbar"><label className="search-input"><Icon name="search" /><span className="visually-hidden">Поиск КВЕД</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Код или слово…" autoComplete="off" spellCheck={false} /></label></div>
        <ul className="kved kved--table">{kv.map(([code, title, rate]) => <li key={code}><span className="num kved__code">{code}</span><span>{title}</span><span className="sub">{rate}</span></li>)}</ul>
        <p className="sub panel__note">Ставки по рішенню Миколаївської міськради придут из таблицы через API — здесь примеры.</p>
      </section>
    </div>
  );
}

const PRIORITY_LABEL: Record<Priority, string> = { critical: 'Критический', high: 'Высокий', medium: 'Средний', low: 'Низкий' };
const PRIORITY_ICON: Record<Priority, IconName> = { critical: 'critical', high: 'high', medium: 'medium', low: 'low' };

export function Tasks() {
  const store = useStore();
  const ui = useUi();
  const [line, setLine] = useState('');
  const parsed = line.trim() ? parseQuickTask(line, store.clients) : null;
  const client = parsed?.clientId ? store.client(parsed.clientId) : undefined;

  const open = store.tasks.filter((t) => !t.done);
  const groups: [string, Task[]][] = [
    ['Просрочено', open.filter((t) => t.due && t.due < TODAY)],
    ['Сегодня', open.filter((t) => t.due === TODAY)],
    ['Завтра', open.filter((t) => t.due === addDays(TODAY, 1))],
    ['Позже', open.filter((t) => t.due && t.due > addDays(TODAY, 1))],
    ['Без срока', open.filter((t) => !t.due)],
    ['Сделано', store.tasks.filter((t) => t.done)],
  ];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!parsed?.text) return;
    store.addTask({ text: parsed.text, clientId: parsed.clientId, due: parsed.due, priority: parsed.priority, type: parsed.type });
    setLine('');
  }

  return (
    <div className="page">
      <header className="page__head"><div><h1 className="page__title">Задачи</h1><p className="page__sub">Звонки, первичка, ключи. Пишите как удобно — клиента и дату пойму сам.</p></div></header>
      <form className="panel quick" onSubmit={submit}>
        <label className="quick__row">
          <Icon name="plus" />
          <span className="visually-hidden">Новая задача</span>
          <input value={line} onChange={(e) => setLine(e.target.value)} autoComplete="off"
            disabled={!canWrite('tasks')} placeholder={canWrite('tasks') ? 'Например: Позвонить Ромашко завтра' : 'Задачи пока — в таблице'} />
          <button type="submit" className="btn btn--primary btn--sm" disabled={!parsed?.text}>Добавить</button>
        </label>
        {parsed && (
          <p className="quick__parsed" aria-live="polite">
            <span className="sub">Понял так:</span>
            <span className="tag">{parsed.text || '…'}</span>
            {client && <span className="tag"><Icon name="fop" size={14} />{client.name.split(' ').slice(0, 2).join(' ')}</span>}
            {parsed.due && <span className="tag"><Icon name="date" size={14} />{fmtDate(parsed.due)}</span>}
            {parsed.priority !== 'medium' && <span className="tag"><Icon name={PRIORITY_ICON[parsed.priority]} size={14} />{PRIORITY_LABEL[parsed.priority]}</span>}
          </p>
        )}
      </form>
      <section className="panel" aria-label="Список задач">
        {groups.filter(([, xs]) => xs.length).map(([title, xs]) => (
          <div key={title} className="dgroup">
            <h2 className={`dgroup__title${title === 'Просрочено' ? ' is-overdue' : ''}`}>{title}<span className="sub">{xs.length}</span></h2>
            <ul className="tasks">
              {xs.map((t) => {
                const c = t.clientId ? store.client(t.clientId) : undefined;
                const saving = store.pending.some((p) => (p.op.kind === 'createTask' && p.op.task.id === t.id) || (p.op.kind === 'completeTask' && p.op.id === t.id));
                return (
                  <li key={t.id} className={`tasks__row${t.done ? ' is-done' : ''}${store.fresh.includes(t.id) ? ' is-fresh' : ''}`}>
                    <button type="button" className="tasks__check" aria-pressed={t.done} aria-label={`Сделано: ${t.text}`}
                      onClick={() => store.toggleTask(t.id, !t.done)}><Icon name="check" size={16} /></button>
                    <span className="tasks__text">
                      {t.priority !== 'medium' && !t.done && <Icon name={PRIORITY_ICON[t.priority]} size={16} className={`prio prio--${t.priority}`} label={PRIORITY_LABEL[t.priority]} />}
                      {t.text}
                      {c && <button type="button" className="link tasks__client" onClick={() => ui.openClient(c.id)}>{c.name.split(' ').slice(0, 2).join(' ')}</button>}
                    </span>
                    {saving ? <SaveBadge state="saving" offline={!store.online} /> : t.due && !t.done && <span className={`sub due--${statusByDays(daysBetween(TODAY, t.due))}`}>{daysLabel(daysBetween(TODAY, t.due))}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}

const MORE: [string, IconName, string][] = [
  ['#/tasks', 'tasks', 'Задачи'], ['#/keys', 'key', 'Ключи ЭЦП'], ['#/reference', 'book', 'Справочник'],
];

export function More() {
  return (
    <div className="page">
      <header className="page__head"><h1 className="page__title">Ещё</h1></header>
      <nav className="panel more" aria-label="Другие разделы">
        {MORE.map(([href, icon, label]) => <a key={href} href={href} className="more__item"><Icon name={icon} /><span>{label}</span><Icon name="chevronRight" /></a>)}
      </nav>
    </div>
  );
}
