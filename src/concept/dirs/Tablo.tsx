// Направление «Табло». Идея: сроки — это табло отправлений. Огромная дата, строки табло с лампой статуса
// и откидными табличками дней; при закрытии таблички перещёлкиваются на «СДАНО», строка складывается вниз.
// Цвет табло — шапка таблицы #1F2937: сайт и таблица выглядят одной системой.
import { useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import { useGSAP } from '@gsap/react';
import { DEADLINES, KEYS, daysLabel, statusByDays } from '../data';
import type { Deadline } from '../data';
import './tablo.css';

gsap.registerPlugin(useGSAP, Flip);

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const FLAP_CHARS = 'АБВГДЕЖЗИКЛМНОПРСТУФ0123456789−';

function flapText(d: Deadline): string {
  if (d.daysLeft < 0) return `−${-d.daysLeft}`;
  return String(d.daysLeft);
}

/** Откидные таблички: каждая буква — своя табличка. Текст для читалки экрана — целиком в aria-label. */
function Flaps({ text, label, done }: { text: string; label: string; done?: boolean }) {
  return (
    <span className={`tb-flaps${done ? ' is-done' : ''}`} role="img" aria-label={label}>
      {text.split('').map((ch, i) => (
        <span key={`${text}-${i}`} className="tb-flap" data-final={ch} aria-hidden="true">
          <span className="tb-flap__ch">{ch}</span>
        </span>
      ))}
    </span>
  );
}

/** Перещёлкивание: 3–5 случайных букв на табличку, затем нужная. Только rotateX и смена текста. */
function riffle(scope: Element, selector = '.tb-flap', stagger = 0.035) {
  if (reduced()) return gsap.timeline();
  const tl = gsap.timeline();
  scope.querySelectorAll<HTMLElement>(selector).forEach((flap, i) => {
    const ch = flap.querySelector<HTMLElement>('.tb-flap__ch');
    const final = flap.dataset.final ?? '';
    if (!ch) return;
    const n = 3 + (i % 3);
    const sub = gsap.timeline();
    for (let k = 0; k <= n; k++) {
      sub.fromTo(ch, { rotateX: -88 }, {
        rotateX: 0, duration: 0.07, ease: 'power1.out',
        onStart: () => { ch.textContent = k === n ? final : FLAP_CHARS[Math.floor(Math.random() * FLAP_CHARS.length)] ?? ''; },
      });
    }
    tl.add(sub, i * stagger);
  });
  return tl;
}

export function TabloToday() {
  const scope = useRef<HTMLDivElement>(null);
  const pendingFlip = useRef<Flip.FlipState | null>(null);
  const [open, setOpen] = useState<Deadline[]>(() => DEADLINES);
  const [done, setDone] = useState<string | null>(null);
  const [closedToday, setClosedToday] = useState(0);
  const [warn, setWarn] = useState<string | null>(null);

  useGSAP(() => {
    if (!scope.current || reduced()) return;
    const tl = gsap.timeline();
    tl.from('.tb-day', { yPercent: 40, opacity: 0, duration: 0.8, ease: 'power4.out' })
      .from('.tb-daywords > *', { y: 16, opacity: 0, duration: 0.5, stagger: 0.07, ease: 'power3.out' }, 0.15)
      .from('.tb-row', { opacity: 0, duration: 0.3, stagger: 0.06 }, 0.25)
      .add(riffle(scope.current, '.tb-board .tb-flap', 0.03), 0.3);
  }, { scope });

  useLayoutEffect(() => {
    if (!pendingFlip.current) return;
    Flip.from(pendingFlip.current, { duration: 0.4, ease: 'power2.inOut' });
    pendingFlip.current = null;
  }, [open]);

  function close(d: Deadline) {
    if (d.periodOpen) {
      setWarn(d.id);
      return;
    }
    setDone(d.id);
    // Дать React перерисовать таблички на «СДАНО», затем перещёлкнуть их и сложить строку.
    requestAnimationFrame(() => {
      const row = scope.current?.querySelector<HTMLElement>(`[data-row="${d.id}"]`);
      if (!row) return;
      const finish = () => {
        pendingFlip.current = Flip.getState('.tb-row');
        setOpen((xs) => xs.filter((x) => x.id !== d.id));
        setDone(null);
        setClosedToday((n) => n + 1);
        requestAnimationFrame(() => { if (scope.current) riffle(scope.current, '.tb-counter .tb-flap', 0); });
      };
      if (reduced()) {
        gsap.to(row, { opacity: 0, duration: 0.15, delay: 0.4, onComplete: finish });
        return;
      }
      gsap.timeline()
        .add(riffle(row, '.tb-flap', 0.05))
        .to(row, { rotateX: -92, opacity: 0, transformOrigin: '50% 0%', duration: 0.35, ease: 'power2.in' }, '+=0.45')
        .add(finish);
    });
  }

  return (
    <div ref={scope} className="tb">
      <header className="tb-head">
        <p className="tb-day num" aria-hidden="true">14</p>
        <div className="tb-daywords">
          <h1 className="tb-h1">Среда, 14 октября</h1>
          <p className="tb-lead">На табло {open.length} {open.length === 1 ? 'срок' : open.length < 5 ? 'срока' : 'сроков'}. Красная лампа — просрочено.</p>
          <p className="tb-counter">Закрыто сегодня <Flaps text={String(closedToday)} label={String(closedToday)} /></p>
        </div>
      </header>

      <section className="tb-board" aria-labelledby="tb-title">
        <div className="tb-board__head">
          <h2 id="tb-title">Сроки</h2>
          <span className="tb-cols" aria-hidden="true"><span>Клиент и что сдать</span><span>Дней</span><span /></span>
        </div>
        <ul className="tb-rows">
          {open.map((d) => {
            const st = statusByDays(d.daysLeft);
            const isDone = done === d.id;
            return (
              <li key={d.id} data-row={d.id} data-flip-id={d.id} className={`tb-row tb-row--${st}`}>
                <span className={`tb-lamp tb-lamp--${isDone ? 'green' : st}`} aria-hidden="true" />
                <div className="tb-row__main">
                  <p className="tb-client">{d.client}</p>
                  <p className="tb-what">{d.what}, до {d.due}{d.amount ? `, ${d.amount}` : ''}</p>
                  {warn === d.id && <p className="tb-warn" role="status">Октябрь ещё не закончился — закрыть можно с 1 ноября.</p>}
                </div>
                <Flaps text={isDone ? 'СДАНО' : flapText(d)} label={isDone ? 'сдано' : daysLabel(d.daysLeft)} done={isDone} />
                <button type="button" className="tb-close" onClick={() => close(d)} disabled={done !== null}>Сдано</button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="tb-keys" aria-labelledby="tb-keys">
        <h2 id="tb-keys" className="tb-h2">Ключи ЭЦП</h2>
        <ul>
          {KEYS.map((k) => (
            <li key={k.client}>
              <span className={`tb-lamp tb-lamp--${statusByDays(k.daysLeft)}`} aria-hidden="true" />
              <span><strong>{k.client}</strong> — ключ до {k.until}, {daysLabel(k.daysLeft)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
