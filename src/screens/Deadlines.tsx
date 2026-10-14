// «Сроки»: календарь месяца + список по дням; закрытие одним нажатием, «Закрыто сегодня» с честным статусом.
// Месяц считается от сегодняшней даты и листается ‹ › (раньше был жёстко «Октябрь 2026»).
import { useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useStore } from '../data/store';
import type { Status } from '../data/types';
import { TODAY, daysBetween, daysInMonth, fmtDate, fmtDayMonth, monthKey, monthName, plural, prevMonthKey, statusByDays } from '../lib/dates';
import { play } from '../lib/sound';
import { Icon } from '../ui/Icon';
import { Empty } from '../ui/Empty';
import { SaveBadge, Tabs, reducedMotion } from '../ui/kit';
import { shortName } from '../ui/names';
import { DayGroups } from './DayGroups';

type Range = 'month' | 'overdue' | 'week' | 'all';
const RANK: Record<Status, number> = { red: 4, orange: 3, yellow: 2, green: 1, grey: 0 };

function nextMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number);
  const yy = m === 12 ? (y ?? 1970) + 1 : (y ?? 1970);
  const mm = m === 12 ? 1 : (m ?? 1) + 1;
  return `${yy}-${String(mm).padStart(2, '0')}`;
}

function Month({ picked, onPick }: { picked: string | null; onPick: (iso: string | null) => void }) {
  const { deadlines } = useStore();
  const [key, setKey] = useState(monthKey(TODAY));
  const n = daysInMonth(key);
  const days = Array.from({ length: n }, (_, i) => `${key}-${String(i + 1).padStart(2, '0')}`);
  // Сдвиг первого дня от понедельника: getUTCDay() 0 — воскресенье.
  const lead = (new Date(`${key}-01T00:00:00Z`).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...days];
  const title = `${monthName(key, 'nom')} ${key.slice(0, 4)}`;
  const inMonth = deadlines.filter((d) => d.due.startsWith(key)).length;
  return (
    <div className="month" role="group" aria-label={`${title}, выбор дня`}>
      <div className="month__head">
        <p className="month__title" aria-live="polite">{monthName(key, 'nom')} <em>{key.slice(0, 4)}</em></p>
        <span className="month__nav">
          <button type="button" className="icon-btn" aria-label="Прошлый месяц" onClick={() => { setKey(prevMonthKey(key)); play('tick'); }}><Icon name="chevronLeft" /></button>
          <button type="button" className="icon-btn" aria-label="Следующий месяц" onClick={() => { setKey(nextMonthKey(key)); play('tick'); }}><Icon name="chevronRight" /></button>
        </span>
      </div>
      <div className="month__grid">
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((w) => <span key={w} className="month__wd" aria-hidden="true">{w}</span>)}
        {cells.map((iso, i) => {
          if (!iso) return <span key={`e${i}`} />;
          const due = deadlines.filter((d) => d.due === iso);
          const worst = due.reduce<Status | null>((w, d) => {
            const s = statusByDays(daysBetween(TODAY, d.due));
            return !w || RANK[s] > RANK[w] ? s : w;
          }, null);
          const count = due.length ? `${due.length} ${plural(due.length, 'срок', 'срока', 'сроков')}` : '';
          return (
            <button key={iso} type="button" aria-pressed={picked === iso}
              className={`month__day${iso === TODAY ? ' is-today' : ''}${iso < TODAY ? ' is-past' : ''}${worst ? ` month__day--${worst}` : ''}`}
              title={count || undefined}
              aria-label={`${fmtDayMonth(iso)}${count ? `, ${count}` : ''}${iso === TODAY ? ', сегодня' : ''}`}
              onClick={() => { onPick(picked === iso ? null : iso); play('tick'); }}>
              <span className="num">{Number(iso.slice(8))}</span>
              {due.length > 0 && <span className="month__n" aria-hidden="true">{due.length}</span>}
            </button>
          );
        })}
      </div>
      <p className="month__legend sub">
        <span><Icon name="overdue" size={16} className="urgency--red" />просрочено</span>
        <span><Icon name="burning" size={16} className="urgency--orange" />горит 0–7{' '}дн.</span>
        <span><Icon name="soon" size={16} className="urgency--yellow" />скоро 8–30{' '}дн.</span>
      </p>
      <p className="month__total sub">В этом месяце открытых сроков: <strong className="num">{inMonth}</strong></p>
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
    gsap.from('.reveal', { y: 14, opacity: 0, duration: 0.5, stagger: 0.05, ease: 'power3.out', clearProps: 'transform,opacity' });
  }, { scope });

  const fits = (days: number, r: Range) => (r === 'overdue' ? days < 0 : r === 'week' ? days <= 7 : r === 'month' ? days <= 30 : true);
  const items = store.deadlines.filter((d) => (picked ? d.due === picked : fits(daysBetween(TODAY, d.due), range)));
  const count = (r: Range) => store.deadlines.filter((d) => fits(daysBetween(TODAY, d.due), r)).length;
  const overdue = count('overdue');

  return (
    <div ref={scope} className="page">
      <header className="page__head reveal">
        <div>
          <h1 className="page__title">Сроки <em>{overdue ? `${overdue} ${plural(overdue, 'просрочен', 'просрочены', 'просрочено')}` : 'без просрочек'}</em></h1>
          <p className="page__sub">Закрыть можно, когда отчётный период закончился, — система проверит сама и создаст следующий срок.</p>
        </div>
      </header>

      <div className="deadlines-grid">
        <aside className="panel panel--pad reveal"><Month picked={picked} onPick={setPicked} /></aside>
        <section className="panel reveal" aria-labelledby="dl-title">
          <header className="panel__head">
            <h2 id="dl-title" className="panel__title">{picked ? fmtDayMonth(picked) : 'Открытые сроки'}<span className="sub num">{items.length}</span></h2>
            {picked
              ? <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPicked(null)}><Icon name="close" size={16} />Все дни</button>
              : <Tabs label="Период" value={range} onChange={(r) => { setRange(r); play('tick'); }} items={[
                { id: 'overdue', label: 'Просрочено', count: count('overdue') },
                { id: 'week', label: 'Неделя', count: count('week') },
                { id: 'month', label: 'Месяц', count: count('month') },
                { id: 'all', label: 'Все', count: count('all') },
              ]} />}
          </header>
          <DayGroups items={items} empty={
            <Empty pic="calm" title={picked ? 'В этот день сроков нет' : 'На этот период открытых сроков нет'}>
              {picked ? 'Выберите другой день в календаре.' : 'Всё сдано. Новые сроки система создаст сама.'}
            </Empty>
          } />
        </section>
      </div>

      {store.closed.length > 0 && (
        <section className="panel reveal" aria-labelledby="closed-title">
          <header className="panel__head"><h2 id="closed-title" className="panel__title">Закрыто сегодня<span className="sub num">{store.closed.length}</span></h2></header>
          <ul className="closed">
            {store.closed.map(({ deadline, next, save, requestId }) => {
              const c = deadline.clientId ? store.client(deadline.clientId) : undefined;
              return (
                <li key={deadline.id} className="closed__row">
                  <span className="closed__check"><Icon name="check" size={16} /></span>
                  <span className="closed__text"><strong>{c ? shortName(c.name) : 'Клиент не указан'}</strong> — {deadline.what}
                    {next && <span className="sub">Система создала следующий: {next.what}, до {fmtDate(next.due)}</span>}</span>
                  <SaveBadge state={save} offline={!store.online} onRetry={() => store.retry(requestId)} />
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => store.reopenDeadline(deadline.id)}><Icon name="undo" size={16} />Вернуть</button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
