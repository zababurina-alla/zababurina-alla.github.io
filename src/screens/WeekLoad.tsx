// «Нагрузка по неделям» на «Сроках»: шесть недель вперёд — сколько сроков на каждой; просроченные — отдельно.
// По снимку, без запросов. Высота полосы — доля от самой загруженной недели. Оформление — за отделом дизайна.
import { useStore } from '../data/store';
import { TODAY, fmtDayMonth, plural } from '../lib/dates';
import { weekLoad } from '../lib/weekLoad';

export function WeekLoadBar() {
  const { deadlines } = useStore();
  const { overdue, weeks } = weekLoad(deadlines.map((d) => d.due), TODAY);
  const max = Math.max(1, ...weeks.map((w) => w.count));
  return (
    <section className="wload" aria-labelledby="wload-t">
      <h3 id="wload-t" className="wload__title">Нагрузка по неделям
        {overdue > 0 && <span className="wload__over">просрочено <strong className="num">{overdue}</strong></span>}</h3>
      <ol className="wload__weeks">
        {weeks.map((w, i) => (
          <li key={w.start} className={`wload__week${i === 0 ? ' is-now' : ''}`}
            title={`${fmtDayMonth(w.start)} — ${fmtDayMonth(w.end)}: ${w.count} ${plural(w.count, 'срок', 'срока', 'сроков')}`}>
            <span className="wload__bar" style={{ '--h': `${Math.round((w.count / max) * 100)}%` } as React.CSSProperties} aria-hidden="true" />
            <span className="wload__n num">{w.count}</span>
            {/* Подпись — понедельник недели «20.10»: шесть колонок по 47 px, «20 октября» не помещалось */}
            <span className="wload__label num">{`${w.start.slice(8, 10)}.${w.start.slice(5, 7)}`}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
