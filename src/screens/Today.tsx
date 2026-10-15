// «Сегодня»: за 10 секунд понять день. Сверху — одна фраза о дне из чисел и четыре плашки срочности (они же фильтр),
// ниже — что сдать по дням; сбоку — вопрос от Дмитрия, ключи ЭЦП, деньги месяца, что изменилось.
import { useRef, useState, useEffect } from 'react';
import { InboxCard } from './Inbox';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useStore } from '../data/store';
import { TODAY, addDays, daysBetween, daysInMonth, daysLabel, fmtDate, monthName, plural, statusByDays, weekday, fmtDayMonth } from '../lib/dates';
import { monthStats } from '../lib/monthStats';
import { formatMoney } from '../lib/money';
import { Icon } from '../ui/Icon';
import type { IconName } from '../ui/Icon';
import { Money, RollingNumber, Tabs, reducedMotion } from '../ui/kit';
import { Empty } from '../ui/Empty';
import { shortName } from '../ui/names';
import { play } from '../lib/sound';
import { useUi } from '../app/ui-context';
import { hasFeature } from '../config';
import { URGENCY_ICON } from './DeadlineTable';
import { TableText } from '../ui/TableText';
import { DayGroups } from './DayGroups';
import { QuestionsPanel } from './Questions';
import { Hint, dismissHint } from '../ui/Hint';
import { navigate } from '../router';

type Filter = 'week' | 'month' | 'overdue' | 'burning' | 'soon';

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

const SOURCE_ICON: Record<string, IconName> = { 'сайт': 'globe', 'бот': 'bot', 'таблица': 'sheet' };

const FILTER_TITLE: Record<Filter, string> = {
  week: 'На этой неделе', overdue: 'Просрочено', burning: 'Горит — 0–7 дней', soon: 'Скоро — 8–30 дней', month: 'До 30 дней',
};

/** Плашка-фильтр первого экрана: значок срочности (цвет + форма), крупное число, подпись и шкала дней. */
function Tally({ icon, tone, n, label, note, pressed, onClick, href }: {
  icon: IconName; tone: string; n: number; label: string; note: string; pressed?: boolean; onClick?: () => void; href?: string;
}) {
  const inner = (
    <>
      <span className="tally__top"><Icon name={icon} size={22} className={`urgency--${tone}`} /><span className="tally__n display"><RollingNumber value={n} /></span></span>
      <span className="tally__l">{label}</span>
      <span className="tally__note">{note}</span>
    </>
  );
  const cls = `tally tally--${tone}${n === 0 ? ' is-zero' : ''}`;
  if (href) return <a className={cls} href={href}>{inner}</a>;
  return <button type="button" className={cls} aria-pressed={pressed} onClick={onClick}>{inner}</button>;
}

export function Today() {
  const store = useStore();
  // Новые вопросы от Дмитрия — при открытии «Сегодня» (не чаще раза в 2 мин, см. store.refreshQuestions).
  const { refreshQuestions, loaded } = store;
  useEffect(() => { if (loaded) void refreshQuestions(); }, [loaded, refreshQuestions]);
  const ui = useUi();
  const scope = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLElement>(null);
  const [filter, setFilter] = useState<Filter>('week');

  // Пороги — словарь значков, п. 1: просрочено < 0, горит 0–7, скоро 8–30 (как цвет строк, statusByDays).
  const withDays = store.deadlines.map((d) => ({ d, st: statusByDays(daysBetween(TODAY, d.due)), days: daysBetween(TODAY, d.due) }));
  const overdue = withDays.filter((x) => x.st === 'red');
  const burning = withDays.filter((x) => x.st === 'orange');
  const soon = withDays.filter((x) => x.st === 'yellow');
  const KEY_DAYS = 14; // бриф, п. 3: ключи, истекающие ≤ 14 дней
  const keys = store.clients.filter((c) => c.keyUntil && daysBetween(TODAY, c.keyUntil) <= KEY_DAYS)
    .sort((a, b) => (a.keyUntil ?? '').localeCompare(b.keyUntil ?? ''));
  // Закончившиеся ключи — не «заканчиваются в ближайшие 14 дней»: считаем и называем отдельно (находка «Пользователя» № 4).
  const keysGone = keys.filter((c) => daysBetween(TODAY, c.keyUntil ?? TODAY) < 0).length;
  const keysSoon = keys.length - keysGone;
  const month = monthStats(store.payments, TODAY);
  // Задачи на сегодня: просроченные и сегодняшние, самые важные — выше.
  const PRIO = { critical: 0, high: 1, medium: 2, low: 3 } as const;
  const todayTasks = store.tasks.filter((t) => !t.done && t.due && t.due <= TODAY)
    .sort((a, b) => PRIO[a.priority] - PRIO[b.priority] || (a.due ?? '').localeCompare(b.due ?? ''));

  const pick = { week: [...overdue, ...burning], overdue, burning, soon, month: withDays.filter((x) => x.days <= 30) }[filter];
  const list = pick.map((x) => x.d);

  // Сцена открытия: первый экран, плашки и листы поднимаются по очереди (16 px, шаг 50 мс). Только при открытии экрана.
  useGSAP(() => {
    if (reducedMotion()) return;
    gsap.from('.reveal', { y: 16, opacity: 0, duration: 0.6, stagger: 0.05, ease: 'power3.out', clearProps: 'transform,opacity' });
  }, { scope });

  const toggle = (f: Filter) => {
    setFilter((cur) => (cur === f ? 'week' : f));
    play('tick');
    dismissHint('today.tally');
    // На узком экране список ниже плашек — показать его.
    window.requestAnimationFrame(() => {
      const top = listRef.current?.getBoundingClientRect().top ?? 0;
      if (top > window.innerHeight * 0.75) listRef.current?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    });
  };

  // «План на сегодня»: дела дня по порядку, как шаги «Сверки рейсов» (1 · 2 · 3). Пустые шаги не показываем.
  // Каждый шаг — одно нажатие к нужному: фильтр списка, лист задач или вопросов, экран ключей.
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  const plan = [
    overdue.length && { key: 'overdue', icon: 'overdue' as const, tone: 'red', title: 'Закрыть просроченные', n: `${overdue.length} ${plural(overdue.length, 'срок', 'срока', 'сроков')}` },
    todayTasks.length && { key: 'tasks', icon: 'tasks' as const, tone: 'accent', title: 'Задачи на сегодня', n: `${todayTasks.length} ${plural(todayTasks.length, 'задача', 'задачи', 'задач')}` },
    store.questions.length && { key: 'q', icon: 'questions' as const, tone: 'wheat', title: 'Ответить Дмитрию', n: `${store.questions.length} ${plural(store.questions.length, 'вопрос', 'вопроса', 'вопросов')}` },
    keys.length && { key: 'keys', icon: 'keys' as const, tone: keysGone ? 'red' : 'accent', title: keysGone ? 'Ключи ЭЦП: закончились' : 'Продлить ключи ЭЦП', n: `${keys.length} ${plural(keys.length, 'клиент', 'клиента', 'клиентов')}` },
    burning.length && { key: 'burning', icon: 'burning' as const, tone: 'orange', title: 'Горит на неделе', n: `${burning.length} ${plural(burning.length, 'срок', 'срока', 'сроков')}` },
  ].filter(Boolean) as { key: string; icon: IconName; tone: string; title: string; n: string }[];
  const goPlan = (key: string) => {
    if (key === 'overdue' || key === 'burning') toggle(key);
    else if (key === 'tasks') scrollTo('t-tasks');
    else if (key === 'q') scrollTo('t-q');
    else if (key === 'keys') navigate('#/keys');
  };

  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
  const weekEnd = addDays(TODAY, 7);

  // Главная фраза дня — из чисел, без украшений: что горит сильнее всего.
  const headline = overdue.length
    ? `${overdue.length} ${plural(overdue.length, 'срок просрочен', 'срока просрочены', 'сроков просрочено')}`
    : burning.length
      ? `${burning.length} ${plural(burning.length, 'срок горит', 'срока горят', 'сроков горят')} на неделе`
      : 'всё спокойно';
  const lede: string[] = [];
  if (overdue.length && burning.length) lede.push(`Ещё ${burning.length} ${plural(burning.length, 'горит', 'горят', 'горят')} до ${fmtDayMonth(weekEnd)}.`);
  if (!overdue.length && !burning.length) lede.push(soon.length ? `Ближайшие сроки — через 8–30 дней, их ${soon.length}.` : 'Открытых сроков на месяц вперёд нет.');
  if (keysGone) lede.push(`${keysGone} ${plural(keysGone, 'ключ ЭЦП уже закончился', 'ключа ЭЦП уже закончились', 'ключей ЭЦП уже закончились')}.`);
  if (keysSoon) lede.push(`${keysSoon} ${plural(keysSoon, 'ключ ЭЦП заканчивается', 'ключа ЭЦП заканчиваются', 'ключей ЭЦП заканчиваются')} в ближайшие ${KEY_DAYS} дней.`);
  if (todayTasks.length) lede.push(`${todayTasks.length} ${plural(todayTasks.length, 'задача', 'задачи', 'задач')} на сегодня.`);
  if (store.questions.length) lede.push(`Дмитрий ждёт ответа на ${store.questions.length} ${plural(store.questions.length, 'вопрос', 'вопроса', 'вопросов')}.`);
  if (overdue.length) lede.push('Начните с красных.');

  return (
    <div ref={scope} className="page today">
      <section className="hero reveal" aria-labelledby="t-hello">
        <p className="eyebrow">{weekday(TODAY)} · {fmtDayMonth(TODAY)} {TODAY.slice(0, 4)}</p>
        <h1 id="t-hello" className="hero__title">{hello},<br /><em className={overdue.length ? 'is-red' : undefined}>{headline}</em></h1>
        <p className="hero__lede">{lede.join(' ')}</p>
        <Hint id="today.tally">Нажмите плашку — в списке ниже останутся только эти сроки. Нажмите ещё раз — снова вся неделя.</Hint>
        <div className="tallies" role="group" aria-label="Сроки по срочности — нажмите, чтобы показать">
          <Tally icon="overdue" tone="red" n={overdue.length} label="Просрочено" note="срок прошёл" pressed={filter === 'overdue'} onClick={() => toggle('overdue')} />
          <Tally icon="burning" tone="orange" n={burning.length} label="Горит" note="0–7 дней" pressed={filter === 'burning'} onClick={() => toggle('burning')} />
          <Tally icon="soon" tone="yellow" n={soon.length} label="Скоро" note="8–30 дней" pressed={filter === 'soon'} onClick={() => toggle('soon')} />
          <Tally icon="keys" tone={keysGone ? 'red' : 'accent'} n={keys.length} label="Ключи ЭЦП"
            note={keysGone ? `${keysGone} ${plural(keysGone, 'закончился', 'закончились', 'закончились')}, ещё ${keysSoon} — до ${KEY_DAYS} дн.` : `до ${KEY_DAYS} дней`} href="#/keys" />
        </div>
      </section>

      <section className="plan reveal" aria-labelledby="t-plan">
        <h2 id="t-plan" className="plan__title">План на сегодня</h2>
        {plan.length ? (
          <ol className="plan__steps">
            {plan.map((p, i) => (
              <li key={p.key}>
                <button type="button" className={`plan__step plan__step--${p.tone}`} onClick={() => goPlan(p.key)}>
                  <span className="plan__n display">{i + 1}</span>
                  <span className="plan__text"><strong>{p.title}</strong><span className="sub">{p.n}</span></span>
                  <Icon name={p.icon} size={20} className={`urgency--${p.tone === 'accent' || p.tone === 'wheat' ? 'grey' : p.tone}`} />
                </button>
              </li>
            ))}
          </ol>
        ) : <p className="plan__done"><Icon name="done" size={20} className="urgency--green" />На сегодня всё сделано: ни просрочек, ни задач, ни вопросов.</p>}
      </section>

      <div className="today-grid">
        <section ref={listRef} className="panel reveal today-list" aria-labelledby="t-dl">
          <header className="panel__head">
            <h2 id="t-dl" className="panel__title">{FILTER_TITLE[filter]}<span className="sub num">{list.length}</span></h2>
            <Tabs label="Какие сроки показать" value={filter} onChange={(f) => { setFilter(f); play('tick'); }} items={[
              { id: 'week', label: 'Неделя', count: overdue.length + burning.length },
              { id: 'month', label: '30 дней', count: withDays.filter((x) => x.days <= 30).length },
            ]} />
          </header>
          {list.length > 0 && <Hint id="today.tick">Круг слева — «сдано и оплачено»: нажмите, когда отчёт сдан и налог оплачен. Ошиблись — «Отменить» 10 секунд. Наведите на строку — появятся «Позвонить», «Платёж» и «Действия».</Hint>}
          <DayGroups items={list} empty={
            <Empty pic="calm" title={filter === 'week' ? 'На этой неделе сдавать нечего' : 'Здесь пусто'}>
              {filter === 'week' ? 'Ни просроченных, ни горящих сроков. Можно выдохнуть.' : 'Сроков с такой срочностью нет.'}
            </Empty>
          } />
        </section>

        <div className="today-side">
          {hasFeature('inbox') && store.inbox.some((i) => i.status === 'new') && (
            <section className="panel reveal" aria-labelledby="t-inbox">
              <header className="panel__head"><h2 id="t-inbox" className="panel__title">Новые от клиентов</h2><a className="link" href="#/inbox">Все входящие</a></header>
              <ul className="inbox">{store.inbox.filter((i) => i.status === 'new').sort((a, b) => b.at.localeCompare(a.at)).slice(0, 3)
                .map((it) => <InboxCard key={it.id} it={it} compact />)}</ul>
            </section>
          )}
          <QuestionsPanel />

          {todayTasks.length > 0 && (
            <section className="panel reveal" aria-labelledby="t-tasks">
              <header className="panel__head"><h2 id="t-tasks" className="panel__title">Задачи на сегодня<span className="sub num">{todayTasks.length}</span></h2><a className="link" href="#/tasks">Все задачи</a></header>
              <ul className="tasks">
                {todayTasks.slice(0, 6).map((t) => {
                  const c = t.clientId ? store.client(t.clientId) : undefined;
                  const late = (t.due ?? TODAY) < TODAY;
                  return (
                    <li key={t.id} className={`tasks__row${store.fresh.includes(t.id) ? ' is-fresh' : ''}`}>
                      <button type="button" className="check-btn tasks__check" aria-pressed={false} aria-label={`Сделано: ${t.text}`}
                        onClick={() => store.toggleTask(t.id, true)}>
                        <span className="check-btn__ring" aria-hidden="true"><Icon name="check" size={16} /></span>
                      </button>
                      <span className="tasks__text">
                        <TableText text={t.text} />
                        {c && <button type="button" className="link tasks__client" onClick={() => ui.openClient(c.id)}>{shortName(c.name)}</button>}
                      </span>
                      {late && <span className="tasks__when due--red"><Icon name="overdue" size={16} className="urgency--red" />{daysLabel(daysBetween(TODAY, t.due ?? TODAY))}</span>}
                    </li>
                  );
                })}
              </ul>
              {todayTasks.length > 6 && <p className="sub tasks__more">Ещё {todayTasks.length - 6} — в «Задачах»</p>}
            </section>
          )}

          <section className="panel reveal" aria-labelledby="t-keys">
            <header className="panel__head"><h2 id="t-keys" className="panel__title">Ключи ЭЦП<span className="sub">до {KEY_DAYS} дней</span></h2><a className="link" href="#/keys">Все ключи</a></header>
            {keys.length ? (
              <ul className="mini">
                {keys.map((c) => {
                  const days = daysBetween(TODAY, c.keyUntil ?? TODAY);
                  const st = statusByDays(days);
                  return (
                    <li key={c.id} className={store.fresh.includes(c.id) ? 'is-fresh' : undefined}>
                      <button type="button" className="mini__row" onClick={() => ui.openClient(c.id)}>
                        <Icon name={URGENCY_ICON[st]} size={18} className={`urgency--${st}`} />
                        <span className="mini__text"><strong>{shortName(c.name)}</strong><span className="sub num">до {fmtDate(c.keyUntil ?? '')}</span></span>
                        <span className={`mini__when due--${st}`}>{daysLabel(days)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="panel__note sub">Ни один ключ не заканчивается в ближайшие {KEY_DAYS} дней.</p>}
          </section>

          <section className="panel reveal money-card" aria-labelledby="t-money">
            <header className="panel__head"><h2 id="t-money" className="panel__title">Получено в {monthName(month.key, 'prep')}</h2><a className="link" href="#/payments">Платежи</a></header>
            {month.total === 0 && month.prevTotal === 0 ? (
              <p className="panel__note sub">В таблице платежей за {monthName(month.key, 'nom').toLowerCase()} и {monthName(month.prevKey, 'nom').toLowerCase()} нет — суммы появятся, когда платёж запишут в таблицу, бота или здесь.</p>
            ) : (
            <div className="money-card__body">
              <p className="money-card__sum display"><RollingNumber value={month.total} format={(n) => formatMoney(n)} /></p>
              <p className="sub">в {monthName(month.prevKey, 'prep')} — <Money text={formatMoney(month.prevTotal)} />
                {month.growth !== null && month.growth !== 0 && (
                  <> · <span className={month.growth > 0 ? 'up' : 'trend-down'}><Icon name={month.growth > 0 ? 'arrowUp' : 'arrowDown'} size={14} />{Math.abs(month.growth)}{' '}% к{' '}{monthName(month.prevKey, 'dat')}</span></>
                )}</p>
              <AreaChart cumulative={month.cumulative} month={month.key} />
            </div>
            )}
          </section>

          <section className="panel reveal" aria-labelledby="t-act">
            <header className="panel__head"><h2 id="t-act" className="panel__title">Что изменилось</h2></header>
            {store.activity.length ? (
              <ul className="feed">
                {store.activity.slice(0, 5).map((a) => (
                  <li key={a.id} className={`feed__item${store.fresh.includes(a.id) ? ' is-fresh' : ''}`}>
                    <span className="feed__icon" title={`Источник: ${a.source}`}><Icon name={SOURCE_ICON[a.source] ?? 'sync'} size={16} /></span>
                    <span className="feed__text"><TableText text={a.text} /><span className="sub">{a.source === 'сайт' ? 'с сайта' : a.source === 'бот' ? 'через бота' : 'в таблице'}, {a.when.slice(11)}</span></span>
                  </li>
                ))}
              </ul>
            ) : <p className="panel__note sub">Сегодня в таблице ничего не менялось.</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
