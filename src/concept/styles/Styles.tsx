// Четыре образца стиля одного экрана «Сегодня» — чтобы Дмитрий выбрал уровень и характер глазами.
// Данные выдуманные (../data). Движение — только загрузка, пересчёт чисел и закрытие срока.
import { useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { DEADLINES, KEYS, QUESTIONS, daysLabel, statusByDays } from '../data';
import type { Deadline, Status } from '../data';
import { IconCheck, IconKey, IconPlus, IconQuestion, IconSearch } from '../icons';
import './styles.css';

gsap.registerPlugin(useGSAP);

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function money(n: number): string {
  // Пробелы между разрядами и перед ₴ — неразрывные, чтобы сумма не переносилась по строкам.
  const NBSP = String.fromCharCode(0xa0);
  const grouped = n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${grouped.replace(/\s/g, NBSP)}${NBSP}₴`;
}
function parseMoney(s?: string): number {
  return s ? Number(s.replace(/[^\d,]/g, '').replace(',', '.')) : 0;
}
function initials(name: string): string {
  const clean = name.replace(/ТОВ|[«»"]/g, '').trim();
  const parts = clean.split(/[\s-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}
const STATUS_TEXT: Record<Status, string> = {
  red: 'Просрочено', orange: 'Горит', yellow: 'Скоро', green: 'В порядке', grey: 'Неактивно',
};

/** Общая логика всех образцов: список, суммы, закрытие с плавным уходом строки. */
function useBoard(scope: React.RefObject<HTMLElement | null>, rowSelector: string) {
  const [open, setOpen] = useState<Deadline[]>(DEADLINES);
  const overdue = open.filter((d) => d.daysLeft < 0).length;
  const burning = open.filter((d) => d.daysLeft >= 0 && d.daysLeft <= 3).length;
  const week = open.filter((d) => d.daysLeft >= 0 && d.daysLeft <= 7).length;
  const dueWeek = open.filter((d) => d.daysLeft <= 7).reduce((s, d) => s + parseMoney(d.amount), 0);
  function close(d: Deadline) {
    if (d.periodOpen) return;
    const row = scope.current?.querySelector<HTMLElement>(`${rowSelector}[data-id="${d.id}"]`);
    const done = () => setOpen((xs) => xs.filter((x) => x.id !== d.id));
    if (!row || reduced()) return done();
    row.classList.add('is-closing');
    gsap.timeline()
      .to(row, { opacity: 0, x: 16, duration: 0.28, ease: 'power2.in', delay: 0.45 })
      .add(done);
  }
  return { open, overdue, burning, week, dueWeek, close };
}

/** Число, которое пересчитывается от прежнего значения к новому (при загрузке — от нуля). */
function Ticker({ value, format = (n: number) => String(Math.round(n)) }: { value: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(0);
  useGSAP(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced()) { el.textContent = format(value); prev.current = value; return; }
    const o = { v: prev.current };
    gsap.to(o, { v: value, duration: 0.9, ease: 'power3.out', onUpdate: () => { el.textContent = format(o.v); } });
    prev.current = value;
  }, { dependencies: [value] });
  return <span ref={ref} className="num">{format(0)}</span>;
}

const PAY_SERIES = [0, 0, 1.2, 1.2, 3.4, 5.1, 5.1, 5.1, 7.9, 9.3, 9.3, 12.6, 14.1, 16.2];

function Sparkline({ className }: { className: string }) {
  const max = 18;
  const pts = PAY_SERIES.map((v, i) => [(i / 30) * 300, 64 - (v / max) * 56] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1] ?? [0, 0];
  return (
    <svg className={className} viewBox="0 0 300 68" preserveAspectRatio="none" aria-hidden="true">
      <path className="spark__area" d={`${line} L${last[0]} 68 L0 68 Z`} />
      <path className="spark__line" d={line} />
      <circle className="spark__dot" cx={last[0]} cy={last[1]} r="3.5" />
    </svg>
  );
}

function useEntrance(scope: React.RefObject<HTMLElement | null>, selector: string) {
  useGSAP(() => {
    if (reduced()) return;
    gsap.from(selector, { y: 14, opacity: 0, duration: 0.55, stagger: 0.04, ease: 'power3.out' });
  }, { scope });
}

/* ═════════ 1. Финтех-премиум ═════════ */
export function FintechToday() {
  const scope = useRef<HTMLDivElement>(null);
  const b = useBoard(scope, '.fx-row');
  useEntrance(scope, '.fx-in');
  return (
    <div ref={scope} className="fx">
      <header className="fx-top fx-in">
        <div>
          <h1 className="fx-h1">Добрый день</h1>
          <p className="fx-sub">Среда, 14 октября 2026</p>
        </div>
        <div className="fx-actions">
          <label className="fx-search"><IconSearch /><input placeholder="Поиск клиента" /><kbd>Ctrl K</kbd></label>
          <button type="button" className="fx-btn"><IconPlus />Записать платёж</button>
        </div>
      </header>

      <section className="fx-kpis fx-in" aria-label="Сводка">
        <div className="fx-kpi fx-kpi--main">
          <p className="fx-kpi__label">К оплате клиентами до 21 октября</p>
          <p className="fx-kpi__value"><Ticker value={b.dueWeek} format={money} /></p>
          <p className="fx-kpi__note">Получено в октябре 16 200,00 ₴ <span className="fx-up">+12 % к сентябрю</span></p>
          <Sparkline className="fx-spark" />
        </div>
        <div className="fx-kpi">
          <p className="fx-kpi__label">Просрочено</p>
          <p className="fx-kpi__value fx-kpi__value--md"><Ticker value={b.overdue} /></p>
          <p className="fx-kpi__note"><span className="fx-dot fx-dot--red" />срока требуют внимания</p>
        </div>
        <div className="fx-kpi">
          <p className="fx-kpi__label">Горит, до 3 дней</p>
          <p className="fx-kpi__value fx-kpi__value--md"><Ticker value={b.burning} /></p>
          <p className="fx-kpi__note"><span className="fx-dot fx-dot--orange" />до субботы</p>
        </div>
        <div className="fx-kpi">
          <p className="fx-kpi__label">Ключи ЭЦП, 14 дней</p>
          <p className="fx-kpi__value fx-kpi__value--md"><Ticker value={KEYS.length} /></p>
          <p className="fx-kpi__note"><span className="fx-dot fx-dot--yellow" />продлить заранее</p>
        </div>
      </section>

      <div className="fx-grid">
        <section className="fx-panel fx-in" aria-labelledby="fx-dl">
          <header className="fx-panel__head">
            <h2 id="fx-dl">Ближайшие сроки</h2>
            <div className="fx-tabs" role="tablist">
              <button type="button" role="tab" aria-selected="true">Все <span>{b.open.length}</span></button>
              <button type="button" role="tab" aria-selected="false">Просрочено <span>{b.overdue}</span></button>
              <button type="button" role="tab" aria-selected="false">Неделя <span>{b.week}</span></button>
            </div>
          </header>
          <div className="fx-table" role="table">
            <div className="fx-thead" role="row">
              <span role="columnheader">Клиент</span><span role="columnheader">Обязательство</span>
              <span role="columnheader">Срок</span><span role="columnheader" className="fx-r">Сумма</span><span role="columnheader">Статус</span><span />
            </div>
            {b.open.map((d) => {
              const st = statusByDays(d.daysLeft);
              return (
                <div key={d.id} data-id={d.id} className="fx-row" role="row">
                  <span className="fx-client" role="cell"><span className="fx-avatar" aria-hidden="true">{initials(d.client)}</span>{d.client}</span>
                  <span className="fx-muted" role="cell">{d.what}</span>
                  <span role="cell"><span className="num">{d.due}</span><span className="fx-muted fx-small">{daysLabel(d.daysLeft)}</span></span>
                  <span className="fx-r num fx-amount" role="cell">{d.amount ?? '—'}</span>
                  <span role="cell"><span className={`fx-pill fx-pill--${st}`}><span className={`fx-dot fx-dot--${st}`} />{STATUS_TEXT[st]}</span></span>
                  <span role="cell" className="fx-r">
                    <button type="button" className="fx-check" aria-label={`Сдано и оплачено: ${d.client}`} onClick={() => b.close(d)}><IconCheck /></button>
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="fx-side">
          <section className="fx-panel fx-in" aria-labelledby="fx-keys">
            <header className="fx-panel__head"><h2 id="fx-keys">Ключи ЭЦП</h2></header>
            {KEYS.map((k) => (
              <div key={k.client} className="fx-mini">
                <span className="fx-ico"><IconKey /></span>
                <span className="fx-mini__t"><strong>{k.client}</strong><span className="fx-muted">до {k.until}</span></span>
                <span className={`fx-pill fx-pill--${statusByDays(k.daysLeft)}`}>{daysLabel(k.daysLeft)}</span>
              </div>
            ))}
          </section>
          <section className="fx-panel fx-in" aria-labelledby="fx-q">
            <header className="fx-panel__head"><h2 id="fx-q">Вопрос от Дмитрия</h2></header>
            {QUESTIONS.map((q) => (
              <div key={q.text} className="fx-q">
                <p>{q.text}</p>
                <div className="fx-q__foot"><span className="fx-muted fx-small">{q.when}</span><button type="button" className="fx-btn fx-btn--ghost">Ответить</button></div>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </div>
  );
}

/* ═════════ 2. Инструмент профи (тёмный, плотный) ═════════ */
function StatusGlyph({ st }: { st: Status }) {
  const fill = { red: 1, orange: 0.75, yellow: 0.5, green: 0.25, grey: 0 }[st];
  const r = 6;
  const c = 2 * Math.PI * r;
  return (
    <svg className={`pr-glyph pr-glyph--${st}`} width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="8" r={r / 2} fill="none" stroke="currentColor" strokeWidth={r} strokeDasharray={`${(c / 2) * fill} ${c}`} transform="rotate(-90 8 8)" />
    </svg>
  );
}

export function ProToday() {
  const scope = useRef<HTMLDivElement>(null);
  const b = useBoard(scope, '.pr-row');
  const [sel, setSel] = useState('d1');
  useEntrance(scope, '.pr-in');
  const groups = [
    { name: 'Просрочено', items: b.open.filter((d) => d.daysLeft < 0) },
    { name: 'Эта неделя', items: b.open.filter((d) => d.daysLeft >= 0 && d.daysLeft <= 7) },
    { name: 'Позже', items: b.open.filter((d) => d.daysLeft > 7) },
  ];
  const cur = b.open.find((d) => d.id === sel) ?? b.open[0];
  return (
    <div ref={scope} className="pr">
      <label className="pr-cmd pr-in"><IconSearch /><input placeholder="Найти клиента, срок или действие…" /><kbd>Ctrl K</kbd></label>
      <div className="pr-filters pr-in" role="tablist">
        <button type="button" role="tab" aria-selected="true">Все <span>{b.open.length}</span></button>
        <button type="button" role="tab" aria-selected="false"><StatusGlyph st="red" />Просрочено <span>{b.overdue}</span></button>
        <button type="button" role="tab" aria-selected="false"><StatusGlyph st="orange" />Горит <span>{b.burning}</span></button>
        <button type="button" role="tab" aria-selected="false"><StatusGlyph st="yellow" />Скоро</button>
        <span className="pr-date">Ср, 14 окт</span>
      </div>
      <div className="pr-split">
        <div className="pr-list pr-in">
          {groups.map((g) => g.items.length > 0 && (
            <section key={g.name}>
              <h2 className="pr-group">{g.name}<span>{g.items.length}</span></h2>
              {g.items.map((d) => {
                const st = statusByDays(d.daysLeft);
                return (
                  <button key={d.id} type="button" data-id={d.id} className="pr-row" aria-current={sel === d.id ? 'true' : undefined} onClick={() => setSel(d.id)}>
                    <StatusGlyph st={st} />
                    <span className="pr-client">{d.client}</span>
                    <span className="pr-what">{d.what}</span>
                    <span className={`pr-days pr-days--${st} num`}>{d.daysLeft < 0 ? `−${-d.daysLeft} дн.` : `${d.daysLeft} дн.`}</span>
                    <span className="pr-amount num">{d.amount ?? ''}</span>
                  </button>
                );
              })}
            </section>
          ))}
        </div>
        {cur && (
          <aside className="pr-detail pr-in" aria-label="Подробно">
            <p className="pr-muted">{cur.what}</p>
            <h2 className="pr-dname">{cur.client}</h2>
            <dl className="pr-props">
              <div><dt>Статус</dt><dd><StatusGlyph st={statusByDays(cur.daysLeft)} /> {STATUS_TEXT[statusByDays(cur.daysLeft)]}</dd></div>
              <div><dt>Срок</dt><dd className="num">{cur.due} · {daysLabel(cur.daysLeft)}</dd></div>
              <div><dt>Сумма</dt><dd className="num">{cur.amount ?? '—'}</dd></div>
              <div><dt>Следующий период</dt><dd>создастся сам после закрытия</dd></div>
            </dl>
            <button type="button" className="pr-btn" onClick={() => b.close(cur)}><IconCheck />Сдано и оплачено <kbd>С</kbd></button>
            <p className="pr-muted pr-small">Все изменения сохраняются в таблицу. Последнее — 14:32.</p>
          </aside>
        )}
      </div>
    </div>
  );
}

/* ═════════ 3. Глубина и стекло ═════════ */
function Ring({ done, total }: { done: number; total: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const ref = useRef<SVGCircleElement>(null);
  useGSAP(() => {
    if (!ref.current || reduced()) return;
    gsap.from(ref.current, { attr: { 'stroke-dasharray': `0 ${c}` }, duration: 1.2, ease: 'power3.out', delay: 0.2 });
  }, { dependencies: [done] });
  return (
    <svg className="gl-ring" viewBox="0 0 128 128" aria-hidden="true">
      <circle cx="64" cy="64" r={r} className="gl-ring__track" />
      <circle ref={ref} cx="64" cy="64" r={r} className="gl-ring__bar" strokeDasharray={`${(done / total) * c} ${c}`} transform="rotate(-90 64 64)" />
    </svg>
  );
}

export function GlassToday() {
  const scope = useRef<HTMLDivElement>(null);
  const b = useBoard(scope, '.gl-row');
  const closedMonth = 18 + (DEADLINES.length - b.open.length);
  useEntrance(scope, '.gl-in');
  return (
    <div ref={scope} className="gl">
      <section className="gl-card gl-hero gl-in">
        <div>
          <p className="gl-muted">Среда, 14 октября</p>
          <h1 className="gl-h1">Сегодня важно<br />закрыть {b.overdue + b.burning} {b.overdue + b.burning === 1 ? 'срок' : b.overdue + b.burning < 5 ? 'срока' : 'сроков'}</h1>
          <p className="gl-lead"><Ticker value={b.overdue} /> просрочено · <Ticker value={b.burning} /> горит · <Ticker value={b.week} /> на неделе</p>
        </div>
        <div className="gl-ringbox">
          <Ring done={closedMonth} total={31} />
          <p className="gl-ringtext"><strong className="num">{closedMonth}</strong><span>из 31 закрыто<br />в октябре</span></p>
        </div>
      </section>
      <div className="gl-bento">
        <section className="gl-card gl-list gl-in" aria-labelledby="gl-dl">
          <h2 id="gl-dl" className="gl-h2">Ближайшие сроки</h2>
          {b.open.slice(0, 5).map((d) => {
            const st = statusByDays(d.daysLeft);
            return (
              <div key={d.id} data-id={d.id} className="gl-row">
                <span className={`gl-badge gl-badge--${st}`}>{daysLabel(d.daysLeft)}</span>
                <span className="gl-row__t"><strong>{d.client}</strong><span className="gl-muted">{d.what}</span></span>
                <span className="num gl-amount">{d.amount ?? ''}</span>
                <button type="button" className="gl-check" aria-label={`Сдано и оплачено: ${d.client}`} onClick={() => b.close(d)}><IconCheck /></button>
              </div>
            );
          })}
        </section>
        <section className="gl-card gl-widget gl-in" aria-labelledby="gl-pay">
          <h2 id="gl-pay" className="gl-h2">Получено в октябре</h2>
          <p className="gl-big num">16 200 ₴</p>
          <Sparkline className="gl-spark" />
        </section>
        <section className="gl-card gl-widget gl-in" aria-labelledby="gl-keys">
          <h2 id="gl-keys" className="gl-h2">Ключи ЭЦП</h2>
          {KEYS.map((k) => (
            <p key={k.client} className="gl-key"><IconKey /><span><strong>{k.client}</strong><span className="gl-muted">{daysLabel(k.daysLeft)}</span></span></p>
          ))}
        </section>
        <section className="gl-card gl-widget gl-in" aria-labelledby="gl-q">
          <h2 id="gl-q" className="gl-h2">Вопрос от Дмитрия</h2>
          <p className="gl-qtext"><IconQuestion />{QUESTIONS[0]?.text}</p>
        </section>
      </div>
    </div>
  );
}

/* ═════════ 4. Строгая типографика ═════════ */
export function SwissToday() {
  const scope = useRef<HTMLDivElement>(null);
  const b = useBoard(scope, '.sw-row');
  useEntrance(scope, '.sw-in');
  return (
    <div ref={scope} className="sw">
      <header className="sw-head sw-in">
        <p>Среда</p>
        <p className="num">14.10.2026</p>
      </header>
      <section className="sw-nums" aria-label="Сводка">
        <div className="sw-in"><p className="sw-n sw-n--alert"><Ticker value={b.overdue} /></p><p>просрочено</p></div>
        <div className="sw-in"><p className="sw-n"><Ticker value={b.burning} /></p><p>горит до субботы</p></div>
        <div className="sw-in"><p className="sw-n"><Ticker value={b.week} /></p><p>на этой неделе</p></div>
        <div className="sw-in"><p className="sw-n"><Ticker value={KEYS.length} /></p><p>ключа ЭЦП истекают</p></div>
      </section>
      <section className="sw-table sw-in" aria-labelledby="sw-dl">
        <h2 id="sw-dl" className="sw-h2">Сроки</h2>
        {b.open.map((d) => {
          const st = statusByDays(d.daysLeft);
          return (
            <div key={d.id} data-id={d.id} className={`sw-row${st === 'red' ? ' is-alert' : ''}`}>
              <span className="sw-client">{d.client}</span>
              <span>{d.what}</span>
              <span className="num">{d.due}</span>
              <span className="num sw-days">{daysLabel(d.daysLeft)}</span>
              <span className="num sw-amount">{d.amount ?? '—'}</span>
              <button type="button" className="sw-btn" onClick={() => b.close(d)}>Сдано</button>
            </div>
          );
        })}
      </section>
    </div>
  );
}
