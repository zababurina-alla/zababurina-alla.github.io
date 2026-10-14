// «Сегодня»: за 10 секунд понять день — сводка, ближайшие сроки, ключи ЭЦП, вопросы, что изменилось.
import { useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useStore } from '../data/store';
import { TODAY, daysBetween, daysInMonth, daysLabel, fmtDate, monthName, plural, statusByDays, weekday, fmtDayMonth } from '../lib/dates';
import { monthStats } from '../lib/monthStats';
import { formatMoney } from '../lib/money';
import { Icon } from '../ui/Icon';
import type { IconName } from '../ui/Icon';
import { RollingNumber, StatusPill, Tabs, reducedMotion } from '../ui/kit';
import { useUi } from '../app/ui-context';
import { useToast } from '../ui/toast';
import { canWrite } from '../config';
import type { Question } from '../data/types';
import { DeadlineTable } from './DeadlineTable';

type Filter = 'all' | 'overdue' | 'burning' | 'week';

/** Нарастающий итог месяца по дням (копейки), ось — все дни месяца: видно, сколько месяца ещё впереди. */
function AreaChart({ cumulative, month }: { cumulative: number[]; month: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const span = daysInMonth(month) - 1;
  const max = Math.max(1, (cumulative.at(-1) ?? 0) * 1.15);
  const pts = cumulative.map((v, i) => [(i / span) * 600, 96 - (v / max) * 86] as const);
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
    const day = Math.round(((e.clientX - r.left) / r.width) * span);
    setHover(day >= 0 && day < pts.length ? day : null);
  };
  return (
    <div className="chart-wrap">
      <svg ref={ref} className="chart" viewBox="0 0 600 100" preserveAspectRatio="none" role="img"
        aria-label={`Поступления в ${monthName(month, 'prep')} нарастающим итогом, сейчас ${formatMoney(cumulative.at(-1) ?? 0)}`}
        onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {[25, 50, 75].map((y) => <line key={y} x1="0" x2="600" y1={y} y2={y} className="chart__grid" />)}
        <path className="chart__area" d={`${line} L${last[0]} 100 L0 100 Z`} />
        <path className="chart__line" d={line} />
        <circle className="chart__dot" cx={last[0]} cy={last[1]} r="4" />
        {hp && <line className="chart__cursor" x1={hp[0]} x2={hp[0]} y1="0" y2="100" />}
      </svg>
      {hp && hover !== null && (
        <>
          <span className="chart__hdot" style={{ left: `${(hp[0] / 600) * 100}%`, top: `${hp[1]}%` }} aria-hidden="true" />
          <span className="chart__tip" style={{ left: `${(hp[0] / 600) * 100}%` }} aria-hidden="true">
            {hover + 1} {monthName(month, 'gen')}<strong className="num">{formatMoney(cumulative[hover] ?? 0)}</strong>
          </span>
        </>
      )}
    </div>
  );
}

/** Ответ на вопрос: варианты — кнопками, текст или число — полем. Записывается в таблицу, вопрос уходит из списка. */
function QuestionAnswer({ q }: { q: Question }) {
  const store = useStore();
  const toast = useToast();
  const [text, setText] = useState('');
  if (!canWrite('questions')) return null;
  const send = (value: string) => {
    const v = value.trim();
    if (!v) return;
    store.answerQuestion(q.id, v, () => toast({ text: `Ответ «${v}» записан в таблицу` }));
  };
  if (q.type === 'choice') {
    return (
      <div className="question__answers" role="group" aria-label="Варианты ответа">
        {q.options.map((o) => <button key={o} type="button" className="btn btn--secondary btn--sm" onClick={() => send(o)}>{o}</button>)}
      </div>
    );
  }
  return (
    <form className="question__answers" onSubmit={(e) => { e.preventDefault(); send(text); }}>
      <input className="input input--sm" value={text} onChange={(e) => setText(e.target.value)} aria-label="Ваш ответ"
        inputMode={q.type === 'number' ? 'decimal' : 'text'} placeholder={q.type === 'number' ? 'Число' : 'Ответ'} autoComplete="off" />
      <button type="submit" className="btn btn--primary btn--sm" disabled={!text.trim()}>Ответить</button>
    </form>
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
  const keys = store.clients.filter((c) => c.keyUntil && daysBetween(TODAY, c.keyUntil) <= 14)
    .sort((a, b) => (a.keyUntil ?? '').localeCompare(b.keyUntil ?? ''));
  const month = monthStats(store.payments, TODAY);

  const list = (filter === 'overdue' ? overdue : filter === 'burning' ? burning : filter === 'week' ? week : withDays.filter((x) => x.days <= 30))
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
          <p className="page__sub">{weekdayCap}, {fmtDayMonth(TODAY)} {TODAY.slice(0, 4)}</p>
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
          <p className="kpi__label">Получено от клиентов в {monthName(month.key, 'prep')}</p>
          <p className="kpi__value"><RollingNumber value={month.total} format={(n) => formatMoney(n)} /></p>
          <p className="kpi__note">в {monthName(month.prevKey, 'prep')} {formatMoney(month.prevTotal)}
            {month.growth !== null && month.growth !== 0 && (
              <> <span className={month.growth > 0 ? 'up' : 'down'}><Icon name={month.growth > 0 ? 'arrowUp' : 'arrowDown'} size={14} />{Math.abs(month.growth)}{' '}% к{' '}{monthName(month.prevKey, 'dat')}</span></>
            )}</p>
          <AreaChart cumulative={month.cumulative} month={month.key} />
        </div>
        <button type="button" className="kpi kpi--btn" onPointerMove={spotlight} onClick={() => setFilter('overdue')}>
          <span className="kpi__label">Просрочено</span>
          <span className="kpi__value kpi__value--md"><RollingNumber value={overdue.length} /></span>
          <span className="kpi__note"><span className="dot dot--red" aria-hidden="true" /><span>{plural(overdue.length, 'срок требует', 'срока требуют', 'сроков требуют')} внимания</span></span>
        </button>
        <button type="button" className="kpi kpi--btn" onPointerMove={spotlight} onClick={() => setFilter('burning')}>
          <span className="kpi__label">Горит, до 3 дней</span>
          <span className="kpi__value kpi__value--md"><RollingNumber value={burning.length} /></span>
          <span className="kpi__note"><span className="dot dot--orange" aria-hidden="true" />до субботы</span>
        </button>
        <a className="kpi kpi--btn" href="#/keys" onPointerMove={spotlight}>
          <span className="kpi__label">Ключи ЭЦП, 14 дней</span>
          <span className="kpi__value kpi__value--md"><RollingNumber value={keys.length} /></span>
          <span className="kpi__note"><span className="dot dot--yellow" aria-hidden="true" />продлить заранее</span>
        </a>
      </section>

      <div className="today-grid">
        <section className="panel reveal" aria-labelledby="t-dl">
          <header className="panel__head">
            <h2 id="t-dl" className="panel__title">Ближайшие сроки</h2>
            <Tabs label="Какие сроки показать" value={filter} onChange={setFilter} items={[
              { id: 'all', label: 'Месяц', count: withDays.filter((x) => x.days <= 30).length },
              { id: 'overdue', label: 'Просрочено', count: overdue.length },
              { id: 'burning', label: 'Горит', count: burning.length },
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

          {store.questions.length > 0 && (
          <section className="panel reveal" aria-labelledby="t-q">
            <header className="panel__head"><h2 id="t-q" className="panel__title">{store.questions.length === 1 ? 'Вопрос' : `Вопросы: ${store.questions.length}`}</h2></header>
            {store.questions.map((q) => (
              <div key={q.id} className="question">
                <p>{q.text}</p>
                <QuestionAnswer q={q} />
                <div className="question__foot"><span className="sub">{fmtDayMonth(q.askedAt.slice(0, 10))}, {q.askedAt.slice(11, 16)}</span><span className="sub">или в Telegram-боте</span></div>
              </div>
            ))}
          </section>
          )}

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
