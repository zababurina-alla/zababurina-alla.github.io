// Колонка КВЕД на «Клиентах» — одной строкой (владелец, 16.10: «КВЕДы столбиком — плохое решение»):
// ⭐ главный КВЕД (по нему считается ЄП — поле kvedMain из «⭐ Расчёт ЄП по: …») + чип «+N».
// Чип по наведению (мышь) или нажатию (палец, клавиатура) показывает все коды с названиями. Список — поверх страницы
// (портал, position: fixed), чтобы лист таблицы его не обрезал; закрывается Esc, щелчком мимо, прокруткой.
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Client } from '../data/types';
import { Icon } from '../ui/Icon';
import { useKvedTitles } from '../data/reference';

type Kved = Client['kved'][number];

const OPEN_DELAY = 120;
const CLOSE_DELAY = 220;

export function KvedCell({ c }: { c: Client }) {
  const mainCode = c.kvedMain ?? null;
  if (!c.kved.length && !mainCode) return <span className="nil">не указан</span>;
  const main: Kved = (mainCode ? c.kved.find((k) => k.code === mainCode) : undefined) ?? (mainCode ? { code: mainCode, title: '' } : c.kved[0] as Kved);
  const others = c.kved.filter((k) => k.code !== main.code);
  const why = mainCode ? `Главный КВЕД — по нему считается ЄП${c.kvedMainNote ? ` (${c.kvedMainNote})` : ''}` : main.title;
  return (
    <span className="kv">
      {mainCode && <Icon name="star" size={14} className="kv__star" />}
      <span className="kv__main num" title={why}>{main.code}</span>
      {others.length > 0 && <KvedMore main={main} isMain={Boolean(mainCode)} note={c.kvedMainNote ?? null} others={others} />}
    </span>
  );
}

function KvedMore({ main, isMain, note, others }: { main: Kved; isMain: boolean; note: string | null; others: Kved[] }) {
  // Название из карточки клиента, иначе — из листа «📑 КВЕДы» (у большинства клиентов в карточке названия нет).
  const titles = useKvedTitles();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const timer = useRef(0);
  const id = useId();
  const later = (fn: () => void, ms: number) => { window.clearTimeout(timer.current); timer.current = window.setTimeout(fn, ms); };
  const fine = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

  // Место — под чипом; не влезает снизу — над ним; по ширине — внутри окна.
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const h = pop.current?.offsetHeight ?? 240;
    const w = pop.current?.offsetWidth ?? 320;
    const up = r.bottom + 8 + h > window.innerHeight && r.top - 8 - h > 0;
    setPos({ top: up ? r.top - 8 - h : r.bottom + 8, left: Math.max(8, Math.min(r.left - 12, window.innerWidth - w - 8)), up });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!btn.current?.contains(e.target as Node) && !pop.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    const shut = () => setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    window.addEventListener('scroll', shut, { capture: true, passive: true });
    window.addEventListener('resize', shut);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('scroll', shut, { capture: true });
      window.removeEventListener('resize', shut);
    };
  }, [open]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Мышь: наведение уже открыло список — нажатие его не закрывает (закрывают уход курсора, Esc, щелчок мимо).
  const hover = fine ? {
    onPointerEnter: () => later(() => setOpen(true), OPEN_DELAY),
    onPointerLeave: () => later(() => setOpen(false), CLOSE_DELAY),
  } : {};

  return (
    <>
      <button ref={btn} type="button" className="kv__more num" aria-expanded={open} aria-controls={open ? id : undefined}
        aria-label={`Ещё ${others.length} КВЕД — показать все`} onClick={() => { window.clearTimeout(timer.current); setOpen((o) => (fine ? true : !o)); }} {...hover}>
        +{others.length}
      </button>
      {open && createPortal(
        <div ref={pop} id={id} role="dialog" aria-label="Все КВЕДы клиента" className={`kv-pop${pos?.up ? ' is-up' : ''}`}
          style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden', top: 0, left: 0 }}
          onPointerEnter={() => window.clearTimeout(timer.current)} onPointerLeave={fine ? () => later(() => setOpen(false), CLOSE_DELAY) : undefined}>
          <ul className="kv-pop__list">
            <li className={`kv-pop__item${isMain ? ' is-main' : ''}`}>
              <span className="kv-pop__code num">{isMain && <Icon name="star" size={14} className="kv__star" />}{main.code}</span>
              <span className="kv-pop__title">{main.title || titles.get(main.code) || 'название не указано'}
                {isMain && <span className="kv-pop__why">по нему считается ЄП{note ? ` · ${note}` : ''}</span>}</span>
            </li>
            {others.map((k) => (
              <li key={k.code} className="kv-pop__item">
                <span className="kv-pop__code num">{k.code}</span>
                <span className="kv-pop__title">{k.title || titles.get(k.code) || 'название не указано'}</span>
              </li>
            ))}
          </ul>
        </div>,
        document.body,
      )}
    </>
  );
}
