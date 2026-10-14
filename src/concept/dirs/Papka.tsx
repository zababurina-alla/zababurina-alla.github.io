// Направление «Подшивка». Идея: сроки — квитанции на столе бухгалтера. Закрыть срок — поставить штамп
// (чернила растекаются и садятся), квитанция отрывается по линии и улетает в картонную папку «Справа».
// На телефоне квитанцию можно смахнуть вправо — это тот же штамп.
import { useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { Draggable } from 'gsap/Draggable';
import { Flip } from 'gsap/Flip';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { useGSAP } from '@gsap/react';
import { DEADLINES, daysLabel, statusByDays } from '../data';
import type { Deadline } from '../data';
import { Chip } from '../screens';
import { Odometer } from './Odometer';
import './papka.css';

gsap.registerPlugin(useGSAP, Draggable, Flip, MotionPathPlugin);

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function stubDate(due: string): { day: string; month: string } {
  const [d, m] = due.split('.');
  return { day: String(Number(d)), month: MONTHS[Number(m) - 1] ?? '' };
}

export function PapkaToday() {
  const scope = useRef<HTMLDivElement>(null);
  const folderRef = useRef<HTMLDivElement>(null);
  const pendingFlip = useRef<Flip.FlipState | null>(null);
  const [open, setOpen] = useState<Deadline[]>(() => DEADLINES.slice(0, 6));
  const [filed, setFiled] = useState(0);
  const [stamped, setStamped] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const closeRef = useRef<(d: Deadline) => void>(() => undefined);

  useGSAP(() => {
    if (reduced()) return;
    gsap.timeline({ defaults: { ease: 'power3.out' } })
      .from('.pk-head > *', { y: 18, opacity: 0, duration: 0.5, stagger: 0.07 })
      .from('.pk-slip', { y: 40, rotate: (i: number) => (i % 2 ? 4 : -4), opacity: 0, duration: 0.6, stagger: 0.07 }, 0.15)
      .from('.pk-folder', { x: 40, opacity: 0, duration: 0.6 }, 0.3);
  }, { scope });

  // Смахнуть вправо = поставить штамп. Порог — треть ширины или быстрый жест.
  useGSAP(() => {
    const drags = Draggable.create('.pk-slip__body', {
      type: 'x',
      bounds: { minX: 0, maxX: 400 },
      edgeResistance: 0.85,
      dragClickables: false,
      onRelease() {
        const el = this.target as HTMLElement;
        const id = el.closest<HTMLElement>('[data-slip]')?.dataset.slip;
        const d = open.find((x) => x.id === id);
        if (d && this.x > el.offsetWidth / 4) {
          gsap.to(el, { x: 0, duration: 0.2, ease: 'power2.out' });
          closeRef.current(d);
        } else {
          gsap.to(el, { x: 0, duration: 0.3, ease: 'power3.out' });
        }
      },
    });
    return () => drags.forEach((dr) => dr.kill());
  }, { scope, dependencies: [open], revertOnUpdate: false });

  useLayoutEffect(() => {
    if (!pendingFlip.current) return;
    Flip.from(pendingFlip.current, { duration: 0.5, ease: 'power2.inOut' });
    pendingFlip.current = null;
  }, [open]);

  function close(d: Deadline) {
    if (d.periodOpen) {
      setWarn(d.id);
      return;
    }
    if (stamped) return;
    setStamped(d.id);
    requestAnimationFrame(() => {
      const slip = scope.current?.querySelector<HTMLElement>(`[data-slip="${d.id}"]`);
      const body = slip?.querySelector<HTMLElement>('.pk-slip__body');
      const stamp = slip?.querySelector<SVGElement>('.pk-stamp');
      const disp = slip?.querySelector<SVGFEDisplacementMapElement>('feDisplacementMap');
      const folder = folderRef.current;
      const finish = () => {
        pendingFlip.current = Flip.getState('.pk-slip');
        setOpen((xs) => xs.filter((x) => x.id !== d.id));
        setStamped(null);
        setFiled((n) => n + 1);
        if (folder && !reduced()) gsap.fromTo(folder, { scale: 1.04 }, { scale: 1, duration: 0.4, ease: 'power2.out' });
      };
      if (!slip || !body || !stamp || !folder || reduced()) {
        if (stamp) gsap.set(stamp, { opacity: 0.9 });
        if (slip) gsap.to(slip, { opacity: 0, duration: 0.2, delay: 0.6, onComplete: finish });
        return;
      }
      const from = body.getBoundingClientRect();
      const to = folder.getBoundingClientRect();
      const dx = to.left + to.width / 2 - (from.left + from.width / 2);
      const dy = to.top + to.height / 3 - (from.top + from.height / 2);
      gsap.timeline()
        // Удар штампа: сверху, быстро, с отдачей по квитанции.
        .fromTo(stamp, { scale: 1.5, opacity: 0, rotate: -14 }, { scale: 1, opacity: 0.92, rotate: -9, duration: 0.16, ease: 'power4.in' })
        .fromTo(slip, { y: 0 }, { y: 3, duration: 0.06, yoyo: true, repeat: 1, ease: 'power1.inOut' }, '>-0.02')
        // Чернила растекаются и садятся.
        .fromTo(disp ?? {}, { attr: { scale: 18 } }, { attr: { scale: 3 }, duration: 0.5, ease: 'power2.out' }, '<')
        // Отрыв по линии и полёт в папку.
        .to(slip.querySelector('.pk-slip__stub'), { opacity: 0.25, duration: 0.25 }, '+=0.35')
        .to(body, {
          motionPath: { path: [{ x: 0, y: 0 }, { x: dx * 0.6, y: Math.min(dy, 0) - 120 }, { x: dx, y: dy }], curviness: 1.2 },
          rotate: 14, scale: 0.18, opacity: 0.4, duration: 0.75, ease: 'power2.in',
        }, '<')
        .add(finish);
    });
  }
  useLayoutEffect(() => {
    closeRef.current = close;
  });

  return (
    <div ref={scope} className="pk">
      <header className="pk-head">
        <p className="pk-date">Среда, 14 октября</p>
        <h1 className="pk-title">Квитанций на столе: {open.length}</h1>
        <p className="pk-lead">Поставьте штамп, когда сдано и оплачено. На телефоне квитанцию можно смахнуть вправо.</p>
      </header>

      <div className="pk-desk">
        <ul className="pk-slips">
          {open.map((d, i) => {
            const st = statusByDays(d.daysLeft);
            const sd = stubDate(d.due);
            return (
              <li key={d.id} data-slip={d.id} data-flip-id={d.id} className="pk-slip" style={{ rotate: `${i % 2 ? 0.5 : -0.4}deg` }}>
                <div className={`pk-slip__stub pk-slip__stub--${st}`}>
                  <span className="pk-stub__day num">{sd.day}</span>
                  <span className="pk-stub__month">{sd.month}</span>
                </div>
                <div className="pk-slip__body">
                  <p className="pk-client">{d.client}</p>
                  <p className="pk-what">{d.what}</p>
                  <p className="pk-meta">
                    <Chip status={st}>{daysLabel(d.daysLeft)}</Chip>
                    {d.amount && <span className="num pk-amount">{d.amount}</span>}
                  </p>
                  {warn === d.id && <p className="pk-warn" role="status">Октябрь ещё не закончился — штамп можно поставить с 1 ноября.</p>}
                  <button type="button" className="pk-btn" onClick={() => close(d)} disabled={stamped !== null}>Поставить штамп</button>
                  <svg className="pk-stamp" viewBox="0 0 160 70" aria-hidden="true" style={{ opacity: stamped === d.id ? undefined : 0 }}>
                    <defs>
                      <filter id={`ink-${d.id}`} x="-10%" y="-10%" width="120%" height="120%">
                        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={i + 3} />
                        <feDisplacementMap in="SourceGraphic" scale="3" />
                      </filter>
                    </defs>
                    <g filter={`url(#ink-${d.id})`}>
                      <rect x="4" y="4" width="152" height="62" rx="8" fill="none" stroke="currentColor" strokeWidth="4" />
                      <text x="80" y="34" textAnchor="middle" className="pk-stamp__big">СДАНО</text>
                      <text x="80" y="54" textAnchor="middle" className="pk-stamp__small">14.10.2026</text>
                    </g>
                  </svg>
                </div>
              </li>
            );
          })}
        </ul>

        <div ref={folderRef} className="pk-folder" aria-live="polite">
          <span className="pk-folder__tab" aria-hidden="true" />
          <p className="pk-folder__label">Справа</p>
          <p className="pk-folder__count">Подшито сегодня: <Odometer value={filed} /></p>
          <span className="pk-folder__strings" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
