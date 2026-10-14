// Ключи ЭЦП, Справочник, Задачи и «Ещё» (телефон). Короче основных экранов, но рабочие.
import { useState } from 'react';
import { useStore } from '../data/store';
import { TODAY, daysBetween, daysLabel, fmtDate, statusByDays } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { fold } from '../lib/search';
import { Icon } from '../ui/Icon';
import type { IconName } from '../ui/Icon';
import { Avatar, StatusPill } from '../ui/kit';
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
  ['ЄСВ в месяц', 190234, '22 % МЗП'],
  ['ЄП 1 группа в месяц', 33280, 'до 10 % ПМ'],
  ['ЄП 2 группа в месяц', 172940, 'до 20 % МЗП'],
];

const KVED_RATES: [string, string, string][] = [
  ['96.02', 'Перукарні та салони краси', '2 гр. — 20 % МЗП'],
  ['47.91', 'Торгівля через інтернет', '2 гр. — 20 % МЗП'],
  ['47.81', 'Торгівля з лотків продуктами', '1 гр. — 10 % ПМ'],
  ['56.10', 'Ресторани', '2 гр. — 20 % МЗП'],
  ['45.20', 'Ремонт автомобілів', '2 гр. — 20 % МЗП'],
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
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Код или слово" /></label></div>
        <ul className="kved kved--table">{kv.map(([code, title, rate]) => <li key={code}><span className="num kved__code">{code}</span><span>{title}</span><span className="sub">{rate}</span></li>)}</ul>
        <p className="sub panel__note">Ставки по рішенню Миколаївської міськради придут из таблицы через API — здесь примеры.</p>
      </section>
    </div>
  );
}

const TASKS = [
  { id: 't1', text: 'Позвонить Ромашко — продлить ключ ЭЦП', due: '2026-10-15' },
  { id: 't2', text: 'Запросить первичку у ТОВ «Бриз-Агро» за сентябрь', due: '2026-10-16' },
  { id: 't3', text: 'Проверить КВЕД 47.91 у Ясенко', due: '2026-10-17' },
];

export function Tasks() {
  const [done, setDone] = useState<string[]>([]);
  return (
    <div className="page">
      <header className="page__head"><div><h1 className="page__title">Задачи</h1><p className="page__sub">Звонки, первичка, ключи.</p></div></header>
      <section className="panel" aria-label="Задачи">
        <ul className="tasks">
          {TASKS.map((t) => {
            const isDone = done.includes(t.id);
            const days = daysBetween(TODAY, t.due);
            return (
              <li key={t.id} className={`tasks__row${isDone ? ' is-done' : ''}`}>
                <button type="button" className="tasks__check" aria-pressed={isDone} aria-label={isDone ? 'Вернуть в работу' : 'Отметить сделанной'}
                  onClick={() => setDone((xs) => (isDone ? xs.filter((x) => x !== t.id) : [...xs, t.id]))}><Icon name="check" size={16} /></button>
                <span className="tasks__text">{t.text}</span>
                <span className="sub">{daysLabel(days)}</span>
              </li>
            );
          })}
        </ul>
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
