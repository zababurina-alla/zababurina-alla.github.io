// Сроки по дням: «Просрочено», «Сегодня», «Завтра», «Пятница, 16 октября». Десятки сроков в один день не растягивают
// экран: в группе видно первые 6, остальное — «Показать ещё N». Одна деталь на «Сегодня» и «Сроки».
// На «Сроках» можно сгруппировать по виду отчёта или по клиенту.
import { useRef, useState } from 'react';
import type { DatedDeadline } from '../data/types';
import { TODAY, addDays, daysBetween, fmtDayMonth, plural, weekday } from '../lib/dates';
import { DeadlineTable } from './DeadlineTable';
import { useStore } from '../data/store';
import { Icon } from '../ui/Icon';
import type { IconName } from '../ui/Icon';
import { OBLIGATION_ICON } from '../ui/obligationIcon';
import { OBLIGATION_LABEL, obligationKind } from '../lib/obligation';
import { useFlipRows } from '../ui/flip';
import type { ObligationKind } from '../lib/obligation';

const FOLD_AT = 8; // порог наш: больше 8 строк в дне — сворачиваем до 6
const FOLD_SHOW = 6;

function dayTitle(key: string): string {
  if (key === 'overdue') return 'Просрочено';
  // «20 января» после декабря — это следующий год: пишем год, чтобы не спутать (находка «Пользователя» № 28).
  if (key.slice(0, 4) !== TODAY.slice(0, 4)) return `${weekday(key).replace(/^./, (s) => s.toUpperCase())}, ${fmtDayMonth(key)} ${key.slice(0, 4)}`;
  const wd = weekday(key);
  if (key === TODAY) return `Сегодня, ${wd} ${fmtDayMonth(key)}`;
  if (key === addDays(TODAY, 1)) return `Завтра, ${wd} ${fmtDayMonth(key)}`;
  return `${wd.replace(/^./, (s) => s.toUpperCase())}, ${fmtDayMonth(key)}`;
}

function Group({ title, tone = '', icon, items, showClient = true }: {
  title: string; tone?: string; icon?: IconName; items: DatedDeadline[]; showClient?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const folded = items.length > FOLD_AT && !open;
  const shown = folded ? items.slice(0, FOLD_SHOW) : items;
  return (
    <section className={`dgroup ${tone}`} aria-label={title}>
      <h3 className="dgroup__title">
        <span className="dgroup__name">{icon && <Icon name={icon} size={18} />}{title}</span>
        <span className="dgroup__count num">{items.length} {plural(items.length, 'срок', 'срока', 'сроков')}</span>
      </h3>
      <DeadlineTable items={shown} showClient={showClient} />
      {folded && (
        <button type="button" className="dgroup__more" onClick={() => setOpen(true)}>
          Показать ещё {items.length - FOLD_SHOW} {plural(items.length - FOLD_SHOW, 'срок', 'срока', 'сроков')}
        </button>
      )}
    </section>
  );
}

export type GroupBy = 'day' | 'kind' | 'client';

/** Сроки группами: по дням (по умолчанию), по виду отчёта или по клиенту. Внутри группы — по дате. */
export function DayGroups({ items, empty, by = 'day' }: { items: DatedDeadline[]; empty: React.ReactNode; by?: GroupBy }) {
  const store = useStore();
  // Фильтр, группировка, закрытие — строки сроков переезжают плавно (FLIP)
  const box = useRef<HTMLDivElement>(null);
  useFlipRows(box, '.dtable__row', `${by}|${items.map((d) => d.id).join(',')}`);
  if (items.length === 0) return <>{empty}</>;
  const sorted = [...items].sort((a, b) => a.due.localeCompare(b.due));
  const groups = new Map<string, DatedDeadline[]>();
  const keyOf = (d: DatedDeadline) => (by === 'kind' ? obligationKind(d.what) : by === 'client' ? d.clientId : daysBetween(TODAY, d.due) < 0 ? 'overdue' : d.due);
  for (const d of sorted) groups.set(keyOf(d), [...(groups.get(keyOf(d)) ?? []), d]);
  let entries = [...groups.entries()];
  if (by === 'client') {
    // Клиенты — по самому раннему сроку (у кого горит — выше), имя — целиком.
    entries = entries.sort((x, y) => (x[1][0]?.due ?? '').localeCompare(y[1][0]?.due ?? ''));
  }
  return (
    <div ref={box} className="dgroups">
      {entries.map(([k, list]) => {
        if (by === 'kind') {
          return <Group key={k} title={OBLIGATION_LABEL[k as ObligationKind]} icon={OBLIGATION_ICON[k as ObligationKind]} items={list} />;
        }
        if (by === 'client') {
          const c = store.client(k);
          return <Group key={k} title={c ? c.name : 'Клиент не найден'} icon="clients" items={list} showClient={false} />;
        }
        return <Group key={k} title={dayTitle(k)} items={list}
          tone={k === 'overdue' ? 'dgroup--overdue' : k === TODAY ? 'dgroup--today' : ''} />;
      })}
    </div>
  );
}
