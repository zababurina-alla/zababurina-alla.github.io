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
    <section className="wload" aria-label="Нагрузка по неделям">
      {overdue > 0 && <p className="wload__over sub">Просрочено: <strong className="num">{overdue}</strong></p>}
      <ol className="wload__weeks">
        {weeks.map((w, i) => (
          <li key={w.start} className={`wload__week${i === 0 ? ' is-now' : ''}`}
            title={`${fmtDayMonth(w.start)} — ${fmtDayMonth(w.end)}: ${w.count} ${plural(w.count, 'срок', 'срока', 'сроков')}`}>
            <span className="wload__bar" style={{ '--h': `${Math.round((w.count / max) * 100)}%` } as React.CSSProperties} aria-hidden="true" />
            <span className="wload__n num">{w.count}</span>
            <span className="wload__label sub">{i === 0 ? 'эта неделя' : fmtDayMonth(w.start)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
