// «Сроки»: календарь месяца + список по дням; закрытие одним нажатием, «Закрыто сегодня» с честным статусом.
import { useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useStore } from '../data/store';
import type { Status } from '../data/types';
import { TODAY, daysBetween, fmtDayMonth, plural, statusByDays, weekday, fmtDue } from '../lib/dates';
import { Icon } from '../ui/Icon';
import { RollingNumber, SaveBadge, Tabs, reducedMotion } from '../ui/kit';
import { DeadlineTable } from './DeadlineTable';

type Range = 'month' | 'overdue' | 'week' | 'all';
const RANK: Record<Status, number> = { red: 4, orange: 3, yellow: 2, green: 1, grey: 0 };

function Month({ picked, onPick }: { picked: string | null; onPick: (iso: string | null) => void }) {
  const { deadlines } = useStore();
  // Октябрь 2026: 1-е — четверг (сдвиг 3 от понедельника).
  const days = Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
  const cells: (string | null)[] = [null, null, null, ...days];
  return (
    <div className="month" role="group" aria-label="Октябрь 2026, выбор дня">
      <div className="month__head"><p className="month__title">Октябрь 2026</p>
        {picked && <button type="button" className="link" onClick={() => onPick(null)}>Весь месяц</button>}</div>
      <div className="month__grid">
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((w) => <span key={w} className="month__wd" aria-hidden="true">{w}</span>)}
        {cells.map((iso, i) => {
          if (!iso) return <span key={`e${i}`} />;
          const due = deadlines.filter((d) => d.due === iso);
          const worst = due.reduce<Status | null>((w, d) => {
            const s = statusByDays(daysBetween(TODAY, d.due));
            return !w || RANK[s] > RANK[w] ? s : w;
          }, null);
          const isToday = iso === TODAY;
          return (
            <button key={iso} type="button" aria-pressed={picked === iso}
              className={`month__day${isToday ? ' is-today' : ''}${worst ? ` month__day--${worst}` : ''}`}
              title={due.length ? `${due.length} ${plural(due.length, 'срок', 'срока', 'сроков')}` : undefined}
              aria-label={`${fmtDayMonth(iso)}${due.length ? `, ${due.length} ${plural(due.length, 'срок', 'срока', 'сроков')}` : ''}`}
              onClick={() => onPick(picked === iso ? null : iso)}>
              <span className="num">{Number(iso.slice(8))}</span>
            </button>
          );
        })}
      </div>
      <p className="month__legend sub"><span><span className="dot dot--red" />просрочено</span><span><span className="dot dot--orange" />горит 0–7{' '}дн.</span><span><span className="dot dot--yellow" />скоро 8–30{' '}дн.</span></p>
    </div>
  );
}

export function Deadlines() {
  const store = useStore();
  const scope = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<Range>('month');
  const [picked, setPicked] = useState<string | null>(null);

  useGSAP(() => {
    if (reducedMotion()) return;
    gsap.from('.reveal', { y: 14, opacity: 0, duration: 0.45, stagger: 0.05, ease: 'power3.out', clearProps: 'transform,opacity' });
  }, { scope });

  const items = store.deadlines
    .map((d) => ({ d, days: daysBetween(TODAY, d.due) }))
    .filter(({ d, days }) => picked ? d.due === picked
      : range === 'overdue' ? days < 0 : range === 'week' ? days <= 7 : range === 'month' ? days <= 30 : true)
    .sort((a, b) => a.d.due.localeCompare(b.d.due));

  // Группы по дням: «Вторник, 20 октября — 5 сроков».
  const groups = new Map<string, typeof items>();
  for (const it of items) {
    const key = it.days < 0 ? 'overdue' : it.d.due;
    groups.set(key, [...(groups.get(key) ?? []), it]);
  }
  const count = (r: Range) => store.deadlines.filter((d) => {
    const days = daysBetween(TODAY, d.due);
    return r === 'overdue' ? days < 0 : r === 'week' ? days <= 7 : r === 'month' ? days <= 30 : true;
  }).length;

  return (
    <div ref={scope} className="page">
      <header className="page__head reveal">
        <div>
          <h1 className="page__title">Сроки</h1>
          <p className="page__sub">Закрыть можно только когда отчётный период закончился — система проверит сама.</p>
        </div>
          <span className="closed-chip" data-closed-counter title="Закрыто сегодня">
            <Icon name="done" size={18} /><span>Закрыто сегодня</span><RollingNumber value={store.closed.length} />
          </span>

      </header>

      <div className="deadlines-grid">
        <aside className="panel panel--pad reveal"><Month picked={picked} onPick={setPicked} /></aside>
        <section className="panel reveal" aria-labelledby="dl-title">
          <header className="panel__head">
            <h2 id="dl-title" className="panel__title">{picked ? fmtDayMonth(picked) : 'Открытые сроки'}</h2>
            {!picked && <Tabs label="Период" value={range} onChange={setRange} items={[
              { id: 'overdue', label: 'Просрочено', count: count('overdue') },
              { id: 'week', label: 'Неделя', count: count('week') },
              { id: 'month', label: 'Месяц', count: count('month') },
              { id: 'all', label: 'Все', count: count('all') },
            ]} />}
          </header>
          {[...groups.entries()].map(([key, list]) => (
            <div key={key} className="dgroup">
              <h3 className={`dgroup__title${key === 'overdue' ? ' is-overdue' : ''}`}>
                {key === 'overdue' ? 'Просрочено' : `${weekday(key).replace(/^./, (s) => s.toUpperCase())}, ${fmtDayMonth(key)}`}
                <span className="sub">{list.length} {plural(list.length, 'срок', 'срока', 'сроков')}</span>
              </h3>
              <DeadlineTable items={list.map((x) => x.d)} />
            </div>
          ))}
          {items.length === 0 && <p className="empty">На этот период открытых сроков нет</p>}
        </section>
      </div>

      {store.undated.length > 0 && (
        <section className="panel reveal" aria-labelledby="undated-title">
          <header className="panel__head"><h2 id="undated-title" className="panel__title">Без даты срока</h2><span className="sub">{store.undated.length}</span></header>
          <p className="sub undated__hint">В таблице у этих сроков пустая дата — проверьте и впишите её там, на сайте они встанут на свой день сами.</p>
          <ul className="closed">
            {store.undated.map((d) => (
              <li key={d.id} className="closed__row">
                <span className="closed__check"><Icon name="calendar" size={16} /></span>
                <span className="closed__text"><strong>{store.client(d.clientId)?.name.split(' ').slice(0, 2).join(' ') ?? 'клиент не найден'}</strong> — {d.what}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {store.closed.length > 0 && (
        <section className="panel reveal" aria-labelledby="closed-title">
          <header className="panel__head"><h2 id="closed-title" className="panel__title">Закрыто сегодня</h2><span className="sub">{store.closed.length}</span></header>
          <ul className="closed">
            {store.closed.map(({ deadline, next, save, requestId }) => (
              <li key={deadline.id} className="closed__row">
                <span className="closed__check"><Icon name="check" size={16} /></span>
                <span className="closed__text"><strong>{store.client(deadline.clientId)?.name.split(' ').slice(0, 2).join(' ')}</strong> — {deadline.what}
                  {next && <span className="sub">Система создала следующий: {next.what}, до {fmtDue(next.due)}</span>}</span>
                <SaveBadge state={save} offline={!store.online} onRetry={() => store.retry(requestId)} />
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => store.reopenDeadline(deadline.id)}><Icon name="undo" size={16} />Вернуть</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
