// Сроки по дням: «Просрочено», «Сегодня», «Завтра», «Пятница, 16 октября». Десятки сроков в один день не растягивают
// экран: в группе видно первые 6, остальное — «Показать ещё N». Одна деталь на «Сегодня» и «Сроки».
import { useState } from 'react';
import type { Deadline } from '../data/types';
import { TODAY, addDays, daysBetween, fmtDayMonth, plural, weekday } from '../lib/dates';
import { DeadlineTable } from './DeadlineTable';

const FOLD_AT = 8; // порог наш: больше 8 строк в дне — сворачиваем до 6
const FOLD_SHOW = 6;

function dayTitle(key: string): string {
  if (key === 'overdue') return 'Просрочено';
  const wd = weekday(key);
  if (key === TODAY) return `Сегодня, ${wd} ${fmtDayMonth(key)}`;
  if (key === addDays(TODAY, 1)) return `Завтра, ${wd} ${fmtDayMonth(key)}`;
  return `${wd.replace(/^./, (s) => s.toUpperCase())}, ${fmtDayMonth(key)}`;
}

function Group({ dayKey, items }: { dayKey: string; items: Deadline[] }) {
  const [open, setOpen] = useState(false);
  const folded = items.length > FOLD_AT && !open;
  const shown = folded ? items.slice(0, FOLD_SHOW) : items;
  return (
    <section className={`dgroup${dayKey === 'overdue' ? ' dgroup--overdue' : ''}${dayKey === TODAY ? ' dgroup--today' : ''}`} aria-label={dayTitle(dayKey)}>
      <h3 className="dgroup__title">
        <span>{dayTitle(dayKey)}</span>
        <span className="dgroup__count num">{items.length} {plural(items.length, 'срок', 'срока', 'сроков')}</span>
      </h3>
      <DeadlineTable items={shown} />
      {folded && (
        <button type="button" className="dgroup__more" onClick={() => setOpen(true)}>
          Показать ещё {items.length - FOLD_SHOW} {plural(items.length - FOLD_SHOW, 'срок', 'срока', 'сроков')}
        </button>
      )}
    </section>
  );
}

export function DayGroups({ items, empty }: { items: Deadline[]; empty: React.ReactNode }) {
  if (items.length === 0) return <>{empty}</>;
  const sorted = [...items].sort((a, b) => a.due.localeCompare(b.due));
  const groups = new Map<string, Deadline[]>();
  for (const d of sorted) {
    const key = daysBetween(TODAY, d.due) < 0 ? 'overdue' : d.due;
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  return <div className="dgroups">{[...groups.entries()].map(([k, list]) => <Group key={k} dayKey={k} items={list} />)}</div>;
}
