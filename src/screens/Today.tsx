// «Сегодня»: за 10 секунд понять день — сводка, ближайшие сроки, ключи ЭЦП, вопросы, что изменилось.
import { useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { OCTOBER_CUMULATIVE, QUESTIONS, SEPTEMBER_TOTAL } from '../data/fake';
import { useStore } from '../data/store';
import { TODAY, daysBetween, daysLabel, fmtDate, plural, statusByDays, weekday, fmtDayMonth } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { Icon } from '../ui/Icon';
import type { IconName } from '../ui/Icon';
import { RollingNumber, StatusPill, Tabs, reducedMotion } from '../ui/kit';
import { useUi } from '../app/ui-context';
import { DeadlineTable } from './DeadlineTable';

type Filter = 'all' | 'overdue' | 'week';

function AreaChart() {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const max = 24;
  const pts = OCTOBER_CUMULATIVE.map((v, i) => [(i / 30) * 600, 96 - (v / max) * 86] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1] ?? [0, 0];
  // Линия прорисовывается слева направо при открытии (один раз, 900 мс).
  useGSAP(() => {
    if (reducedMotion()) return;
    const path = ref.current?.querySelector<SVGPathElement>('.chart__line');
    if (!path) return;
    const len = path.getTotalLength();
    gsap.fromTo(path, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 0.9, ease: 'power2.out', delay: 0.15 });
    gsap.from(ref.current?.querySelectorAll('.chart__area, .chart__dot') ?? [], { opacity: 0, duration: 0.5, delay: 0.6 });
  }, { scope: ref });
  const hp = hover === null ? null : pts[hover];
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const day = Math.round(((e.clientX - r.left) / r.width) * 30);
    setHover(day >= 0 && day < pts.length ? day : null);
  };
  return (
    <div className="chart-wrap">
      <svg ref={ref} className="chart" viewBox="0 0 600 100" preserveAspectRatio="none" role="img"
        aria-label={`Поступления в октябре нарастающим итогом, сейчас ${OCTOBER_CUMULATIVE.at(-1)} тыс. ₴`}
        onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {[25, 50, 75].map((y) => <line key={y} x1="0" x2="600" y1={y} y2={y} className="chart__grid" />)}
        <path className="chart__area" d={`${line} L${last[0]} 100 L0 100 Z`} />
        <path className="chart__line" d={line} />
        <circle className="chart__dot chart__dot--live" cx={last[0]} cy={last[1]} r="4" />
        {hp && <line className="chart__cursor" x1={hp[0]} x2={hp[0]} y1="0" y2="100" />}
      </svg>
      {hp && hover !== null && (
        <>
          <span className="chart__hdot" style={{ left: `${(hp[0] / 600) * 100}%`, top: `${hp[1]}%` }} aria-hidden="true" />
          <span className="chart__tip" style={{ left: `${(hp[0] / 600) * 100}%` }} role="status">
            {hover + 1} октября<strong className="num">{formatMoney(Math.round((OCTOBER_CUMULATIVE[hover] ?? 0) * 100_000))}</strong>
          </span>
        </>
      )}
    </div>
  );
}

const SOURCE_ICON: Record<string, IconName> = { 'сайт': 'globe', 'бот': 'bot', 'таблица': 'sheet' };

export function Today() {
  const store = useStore();
  const ui = useUi();
  const scope = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const withDays = store.deadlines.map((d) => ({ d, days: daysBetween(TODAY, d.due) }));
  const overdue = withDays.filter((x) => x.days < 0);
  const burning = withDays.filter((x) => x.days >= 0 && x.days <= 3);
  const week = withDays.filter((x) => x.days <= 7);
  const dueWeekKop = week.reduce((s, x) => s + (x.d.kopecks ?? 0), 0);
  const keys = store.clients.filter((c) => c.keyUntil && daysBetween(TODAY, c.keyUntil) <= 14)
    .sort((a, b) => (a.keyUntil ?? '').localeCompare(b.keyUntil ?? ''));
  const received = store.payments.filter((p) => p.date.startsWith('2026-10')).reduce((s, p) => s + p.kopecks, 0);
  const growth = Math.round((received / 100 / SEPTEMBER_TOTAL - 1) * 100);

  const list = (filter === 'overdue' ? overdue : filter === 'week' ? week : withDays.filter((x) => x.days <= 30))
    .sort((a, b) => a.days - b.days).map((x) => x.d);

  // Сцена открытия: блоки поднимаются по очереди (16 px, 40 мс между ними). Только при открытии экрана.
  useGSAP(() => {
    if (reducedMotion()) return;
    gsap.from('.reveal', { y: 16, opacity: 0, duration: 0.5, stagger: 0.05, ease: 'power3.out', clearProps: 'transform,opacity' });
  }, { scope });

  // Мягкий свет за курсором на карточках сводки (только мышь; на телефоне не работает и не нужен).
  const spotlight = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
  };

  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
  const weekdayCap = weekday(TODAY).replace(/^./, (s) => s.toUpperCase());

  return (
    <div ref={scope} className="page">
      <header className="page__head reveal">
        <div>
          <h1 className="page__title">{hello}</h1>
          <p className="page__sub">{weekdayCap}, {fmtDayMonth(TODAY)} 2026</p>
        </div>
        <div className="page__actions">
          <span className="closed-chip" data-closed-counter title="Закрыто сегодня">
            <Icon name="done" size={18} /><span>Закрыто сегодня</span><RollingNumber value={store.closed.length} />
          </span>
        <a className="search-field" href="#/clients/search">
          <Icon name="search" /><span>Поиск клиента</span><kbd className="kbd">Ctrl K</kbd>
        </a>
        </div>
      </header>

      <section className="kpis reveal" aria-label="Сводка дня">
        <div className="kpi kpi--wide" onPointerMove={spotlight}>
          <p className="kpi__label">К оплате клиентами до {fmtDate('2026-10-21').slice(0, 5)}</p>
          <p className="kpi__value"><RollingNumber value={dueWeekKop} format={(n) => formatMoney(n)} /></p>
          <p className="kpi__note">Получено в октябре <RollingNumber value={received} format={(n) => formatMoney(n)} /> <span className="up"><Icon name="arrowUp" size={14} />{growth} % к сентябрю</span></p>
          <AreaChart />
        </div>
        <button type="button" className="kpi kpi--btn" onPointerMove={spotlight} onClick={() => setFilter('overdue')}>
          <p className="kpi__label">Просрочено</p>
          <p className="kpi__value kpi__value--md"><RollingNumber value={overdue.length} /></p>
          <p className="kpi__note"><span className="dot dot--red" aria-hidden="true" /><span>{plural(overdue.length, 'срок требует', 'срока требуют', 'сроков требуют')} внимания</span></p>
        </button>
        <button type="button" className="kpi kpi--btn" onPointerMove={spotlight} onClick={() => setFilter('week')}>
          <p className="kpi__label">Горит, до 3 дней</p>
          <p className="kpi__value kpi__value--md"><RollingNumber value={burning.length} /></p>
          <p className="kpi__note"><span className="dot dot--orange" aria-hidden="true" />до субботы</p>
        </button>
        <a className="kpi kpi--btn" href="#/keys" onPointerMove={spotlight}>
          <p className="kpi__label">Ключи ЭЦП, 14 дней</p>
          <p className="kpi__value kpi__value--md"><RollingNumber value={keys.length} /></p>
          <p className="kpi__note"><span className="dot dot--yellow" aria-hidden="true" />продлить заранее</p>
        </a>
      </section>

      <div className="today-grid">
        <section className="panel reveal" aria-labelledby="t-dl">
          <header className="panel__head">
            <h2 id="t-dl" className="panel__title">Ближайшие сроки</h2>
            <Tabs label="Какие сроки показать" value={filter} onChange={setFilter} items={[
              { id: 'all', label: 'Месяц', count: withDays.filter((x) => x.days <= 30).length },
              { id: 'overdue', label: 'Просрочено', count: overdue.length },
              { id: 'week', label: 'Неделя', count: week.length },
            ]} />
          </header>
          <DeadlineTable items={list} empty="Здесь пусто — все сроки закрыты" />
        </section>

        <div className="today-side">
          <section className="panel reveal" aria-labelledby="t-keys">
            <header className="panel__head"><h2 id="t-keys" className="panel__title">Ключи ЭЦП</h2><a className="link" href="#/keys">Все</a></header>
            <ul className="mini">
              {keys.map((c) => {
                const days = daysBetween(TODAY, c.keyUntil ?? TODAY);
                return (
                  <li key={c.id} className={store.fresh.includes(c.id) ? 'is-fresh' : undefined}>
                    <button type="button" className="mini__row" onClick={() => ui.openClient(c.id)}>
                      <span className="mini__icon"><Icon name="key" /></span>
                      <span className="mini__text"><strong>{c.name.split(' ').slice(0, 2).join(' ')}</strong><span className="sub">до {fmtDate(c.keyUntil ?? '')}</span></span>
                      <StatusPill status={statusByDays(days)}>{daysLabel(days)}</StatusPill>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="panel reveal" aria-labelledby="t-q">
            <header className="panel__head"><h2 id="t-q" className="panel__title">Вопрос от Дмитрия</h2></header>
            {QUESTIONS.map((q) => (
              <div key={q.id} className="question">
                <p>{q.text}</p>
                <div className="question__foot"><span className="sub">{q.when}</span><button type="button" className="btn btn--secondary btn--sm">Ответить</button></div>
              </div>
            ))}
          </section>

          <section className="panel reveal" aria-labelledby="t-act">
            <header className="panel__head"><h2 id="t-act" className="panel__title">Что изменилось</h2></header>
            <ul className="feed">
              {store.activity.slice(0, 5).map((a) => (
                <li key={a.id} className={`feed__item${store.fresh.includes(a.id) ? ' is-fresh' : ''}`}>
                  <span className="feed__icon" title={`Источник: ${a.source}`}><Icon name={SOURCE_ICON[a.source] ?? 'sync'} size={16} /></span>
                  <span className="feed__text">{a.text}<span className="sub">{a.source === 'сайт' ? 'с сайта' : a.source === 'бот' ? 'через бота' : 'в таблице'}, {a.when.slice(11)}</span></span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
