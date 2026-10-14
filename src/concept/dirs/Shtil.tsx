// Направление «Штиль». Идея: нагрузка месяца — это море у Николаева. Каждый срок поднимает воду в свой день;
// закрытый срок — капля, которая падает в волну, и вода в этот день уходит. Всё закрыто — штиль.
import { useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { useGSAP } from '@gsap/react';
import { DEADLINES, KEYS, QUESTIONS, daysLabel, statusByDays } from '../data';
import type { Deadline } from '../data';
import { IconCheck, IconKey, IconQuestion } from '../icons';
import { Chip } from '../screens';
import { Odometer } from './Odometer';
import {
  DAYS_BACK, DAYS_SPAN, SAMPLES, WAVE_H, WAVE_W, dayOffset, heights, seaWord, surfaceY, wavePaths, xOfDay,
} from './wave';
import './shtil.css';

gsap.registerPlugin(useGSAP, Flip, MotionPathPlugin);

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const TICKS = [
  { off: 0, label: '7 окт' },
  { off: DAYS_BACK, label: 'сегодня' },
  { off: 14, label: '21 окт' },
  { off: 21, label: '28 окт' },
  { off: 28, label: '4 ноя' },
];

export function ShtilToday() {
  const scope = useRef<HTMLDivElement>(null);
  const areaRef = useRef<SVGPathElement>(null);
  const lineRef = useRef<SVGPathElement>(null);
  const markerRefs = useRef(new Map<string, SVGGElement>());
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const cur = useRef<number[]>(new Array<number>(SAMPLES).fill(0));
  const swell = useRef({ a: 0, phase: 0 });
  const pendingFlip = useRef<Flip.FlipState | null>(null);

  const [open, setOpen] = useState<Deadline[]>(() => DEADLINES.filter((d) => d.daysLeft <= 30));
  const [closedToday, setClosedToday] = useState(0);
  const [closing, setClosing] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const overdue = open.filter((d) => d.daysLeft < 0).length;
  const burning = open.filter((d) => d.daysLeft >= 0 && d.daysLeft <= 3).length;
  const week = open.filter((d) => d.daysLeft > 3 && d.daysLeft <= 7).length;
  const word = seaWord(open);

  /** Перерисовать воду и поставить точки сроков на её поверхность. */
  function render() {
    const { area, line } = wavePaths(cur.current, swell.current.a, swell.current.phase);
    areaRef.current?.setAttribute('d', area);
    lineRef.current?.setAttribute('d', line);
    markerRefs.current.forEach((g, id) => {
      const d = DEADLINES.find((x) => x.id === id);
      if (!d) return;
      const x = xOfDay(dayOffset(d.due));
      g.setAttribute('transform', `translate(${x.toFixed(1)} ${surfaceY(cur.current, x).toFixed(1)})`);
    });
  }

  /** Лёгкое волнение, которое само затихает: 4–5 с, потом вода неподвижна (не крутим анимацию часами). */
  function stir(amount: number) {
    if (reduced()) return;
    swell.current.a = Math.max(swell.current.a, amount);
    gsap.killTweensOf(swell.current);
    gsap.to(swell.current, { a: 0, duration: 4.5, ease: 'sine.out' });
    const tick = () => {
      swell.current.phase += 0.045;
      render();
      if (swell.current.a < 0.02) gsap.ticker.remove(tick);
    };
    gsap.ticker.remove(tick);
    gsap.ticker.add(tick);
  }

  function tide(to: number[], duration: number) {
    gsap.killTweensOf(cur.current);
    if (reduced() || duration === 0) {
      cur.current = to.slice();
      render();
      return;
    }
    gsap.to(cur.current, { endArray: to, duration, ease: 'sine.inOut', onUpdate: render });
  }

  // Сцена загрузки: одна, ~1,2 с, ничего не блокирует. Слово дня поднимается по буквам, вода прибывает, точки всплывают.
  useGSAP(
    () => {
      const target = heights(open);
      if (reduced()) {
        tide(target, 0);
        return;
      }
      render();
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.from('.sh-word__ch', { yPercent: 70, opacity: 0, duration: 0.7, stagger: 0.04 })
        .from('.sh-sentence', { y: 14, opacity: 0, duration: 0.5 }, 0.15)
        .add(() => { tide(target, 1.3); stir(7); }, 0.1)
        .from('.sh-marker__dot', { scale: 0.3, opacity: 0, duration: 0.45, stagger: 0.06, transformOrigin: '50% 50%' }, 0.7)
        .from('.sh-row', { y: 18, opacity: 0, duration: 0.5, stagger: 0.05 }, 0.35)
        .from('.sh-side > *', { y: 18, opacity: 0, duration: 0.5, stagger: 0.08 }, 0.5);
    },
    { scope },
  );

  // Строки, оставшиеся после закрытия, плавно занимают освободившееся место (Flip — только transform).
  useLayoutEffect(() => {
    if (!pendingFlip.current) return;
    Flip.from(pendingFlip.current, { duration: 0.45, ease: 'power2.inOut' });
    pendingFlip.current = null;
  }, [open]);

  function close(d: Deadline, button: HTMLButtonElement) {
    if (d.periodOpen) {
      setFlash(`warn:${d.id}`);
      return;
    }
    setClosing(d.id);
    const row = rowRefs.current.get(d.id);
    const marker = markerRefs.current.get(d.id);
    const rest = open.filter((x) => x.id !== d.id);

    const finish = () => {
      pendingFlip.current = Flip.getState('.sh-row');
      setOpen(rest);
      setClosing(null);
      setClosedToday((n) => n + 1);
    };

    if (reduced() || !marker || !row) {
      tide(heights(rest), 0);
      if (row) gsap.to(row, { opacity: 0, duration: 0.15, onComplete: finish });
      else finish();
      return;
    }

    // 1) Капля летит по дуге от кнопки к своему дню на волне.
    const from = button.getBoundingClientRect();
    const to = marker.getBoundingClientRect();
    const drop = document.createElement('span');
    drop.className = 'sh-drop';
    drop.style.left = `${from.left + from.width / 2 - 9}px`;
    drop.style.top = `${from.top + from.height / 2 - 9}px`;
    document.body.appendChild(drop);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);

    const tl = gsap.timeline();
    tl.to(row, { opacity: 0.35, duration: 0.25, ease: 'power2.out' }, 0)
      .to(drop, {
        motionPath: { path: [{ x: 0, y: 0 }, { x: dx * 0.45, y: Math.min(0, dy) - 160 }, { x: dx, y: dy }], curviness: 1.3 },
        scale: 0.55,
        duration: 0.8,
        ease: 'power1.inOut',
      }, 0.05)
      // 2) Капля входит в воду: круги расходятся, вода в этот день опускается, море ненадолго волнуется.
      .add(() => {
        drop.remove();
        const ring = scope.current?.querySelector<SVGCircleElement>(`[data-ring="${d.id}"]`);
        if (ring) gsap.fromTo(ring, { attr: { r: 6 }, opacity: 0.9 }, { attr: { r: 46 }, opacity: 0, duration: 0.9, ease: 'power2.out' });
        tide(heights(rest), 1.2);
        stir(5);
      })
      .to(row, { opacity: 0, x: 24, duration: 0.25, ease: 'power2.in' }, '-=0.05')
      .add(finish);
  }

  return (
    <div ref={scope} className="sh">
      <section className="sh-field" aria-labelledby="sh-word">
        <div className="sh-field__top">
          <p className="sh-date">Среда, 14 октября</p>
          <p className="sh-closed">Закрыто сегодня: <Odometer value={closedToday} /></p>
        </div>
        <h1 id="sh-word" className="sh-word" aria-label={word}>
          {/* key={word}: при смене слова оно появляется заново (переход — CSS, без прыжка) */}
          <span key={word} className="sh-word__in" aria-hidden="true">
            {word.split('').map((ch, i) => <span key={i} className="sh-word__ch">{ch}</span>)}
          </span>
        </h1>
        <p className="sh-sentence">
          <Odometer value={overdue} /> {plural(overdue, 'срок просрочен', 'срока просрочены', 'сроков просрочено')},{' '}
          <Odometer value={burning} /> {plural(burning, 'горит', 'горят', 'горят')} до субботы,{' '}
          <Odometer value={week} /> на неделе.
        </p>

        <figure className="sh-sea">
          <svg viewBox={`0 0 ${WAVE_W} ${WAVE_H}`} preserveAspectRatio="none" className="sh-sea__svg" role="img"
            aria-label="Нагрузка по дням: чем выше вода, тем больше сроков в этот день">
            <line className="sh-today" x1={xOfDay(DAYS_BACK)} x2={xOfDay(DAYS_BACK)} y1="0" y2={WAVE_H} />
            <path ref={areaRef} className="sh-sea__area" />
            <path ref={lineRef} className="sh-sea__line" />
          </svg>
          {/* Точки — отдельный слой без растяжения, чтобы круги оставались кругами */}
          <svg viewBox={`0 0 ${WAVE_W} ${WAVE_H}`} preserveAspectRatio="none" className="sh-sea__marks" aria-hidden="true">
            {open.map((d) => (
              <g key={d.id} ref={(el) => { if (el) markerRefs.current.set(d.id, el); else markerRefs.current.delete(d.id); }}
                className={`sh-marker sh-marker--${statusByDays(d.daysLeft)}`}>
                <circle data-ring={d.id} className="sh-marker__ring" r="0" />
              </g>
            ))}
          </svg>
          <div className="sh-sea__dots">
            {open.map((d) => {
              const x = (xOfDay(dayOffset(d.due)) / WAVE_W) * 100;
              return (
                <button key={d.id} type="button" className={`sh-marker__dot sh-marker--${statusByDays(d.daysLeft)}`}
                  style={{ left: `${x}%`, top: `${(surfaceY(heights(open), xOfDay(dayOffset(d.due))) / WAVE_H) * 100}%` }}
                  aria-label={`${d.client}: ${d.what}, ${daysLabel(d.daysLeft)}`}
                  onClick={() => {
                    rowRefs.current.get(d.id)?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' });
                    setFlash(d.id);
                    window.setTimeout(() => setFlash(null), 1600);
                  }} />
              );
            })}
          </div>
          <figcaption className="sh-ticks">
            {TICKS.map((t) => (
              <span key={t.off} style={{ left: `${(t.off / DAYS_SPAN) * 100}%` }} className={t.off === DAYS_BACK ? 'is-today' : ''}>
                {t.label}
              </span>
            ))}
          </figcaption>
        </figure>
      </section>

      <div className="sh-body">
        <section className="sh-main" aria-labelledby="sh-list-title">
          <h2 id="sh-list-title" className="sh-h">Ближайшие сроки</h2>
          {open.length === 0 && <p className="sh-calm">Всё закрыто. Штиль.</p>}
          <ul className="sh-list">
            {open.map((d) => {
              const st = statusByDays(d.daysLeft);
              return (
                <li key={d.id} data-flip-id={d.id} ref={(el) => { if (el) rowRefs.current.set(d.id, el); else rowRefs.current.delete(d.id); }}
                  className={`sh-row sh-row--${st}${flash === d.id ? ' is-flash' : ''}`}>
                  <div className="sh-row__main">
                    <p className="sh-row__client">{d.client}</p>
                    <p className="sh-row__what">{d.what}</p>
                    <p className="sh-row__meta">
                      <Chip status={st}>{daysLabel(d.daysLeft)}</Chip>
                      <span className="num">до {d.due}</span>
                      {d.amount && <span className="num sh-row__amount">{d.amount}</span>}
                    </p>
                    {flash === `warn:${d.id}` && (
                      <p className="sh-row__warn" role="status">Октябрь ещё не закончился — закрыть этот срок можно с 1 ноября.</p>
                    )}
                  </div>
                  <button type="button" className={`sh-close${closing === d.id ? ' is-done' : ''}`}
                    disabled={closing !== null} onClick={(e) => close(d, e.currentTarget)}>
                    <IconCheck />
                    <span>Сдано и оплачено</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <aside className="sh-side">
          <section aria-labelledby="sh-keys">
            <h2 id="sh-keys" className="sh-h">Ключи ЭЦП</h2>
            <ul className="sh-mini">
              {KEYS.map((k) => (
                <li key={k.client}>
                  <span className="sh-mini__icon"><IconKey /></span>
                  <span className="sh-mini__text"><strong>{k.client}</strong><span>до {k.until}</span></span>
                  <Chip status={statusByDays(k.daysLeft)}>{daysLabel(k.daysLeft)}</Chip>
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="sh-q">
            <h2 id="sh-q" className="sh-h">Вопросы от Дмитрия</h2>
            <ul className="sh-mini">
              {QUESTIONS.map((q) => (
                <li key={q.text}>
                  <span className="sh-mini__icon"><IconQuestion /></span>
                  <span className="sh-mini__text"><strong>{q.text}</strong><span>{q.when}</span></span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
