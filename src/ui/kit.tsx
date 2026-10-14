// Мелкие общие элементы: число с пересчётом, значок статуса, инициалы, вкладки со скользящим индикатором.
import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import type { SaveState, Status } from '../data/types';
import { Icon } from './Icon';

gsap.registerPlugin(useGSAP);

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Число, которое плавно пересчитывается от прежнего значения к новому (при первом показе — от нуля). */
export function Ticker({ value, format = (n) => String(Math.round(n)), className = '' }: {
  value: number; format?: (n: number) => string; className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(0);
  useGSAP(() => {
    const el = ref.current;
    if (!el) return;
    if (reducedMotion()) {
      el.textContent = format(value);
    } else {
      const o = { v: prev.current };
      gsap.to(o, { v: value, duration: 0.7, ease: 'power3.out', onUpdate: () => { el.textContent = format(o.v); } });
    }
    prev.current = value;
  }, { dependencies: [value] });
  return <span ref={ref} className={`num ${className}`} aria-label={format(value)}>{format(0)}</span>;
}

const STATUS_TEXT: Record<Status, string> = {
  red: 'Просрочено', orange: 'Горит', yellow: 'Скоро', green: 'В порядке', grey: 'Неактивно',
};

export function StatusPill({ status, children }: { status: Status; children?: React.ReactNode }) {
  return (
    <span className={`pill pill--${status}`}>
      <span className={`dot dot--${status}`} aria-hidden="true" />
      {children ?? STATUS_TEXT[status]}
    </span>
  );
}

export function initials(name: string): string {
  const clean = name.replace(/ТОВ|[«»"]/g, '').trim();
  const parts = clean.split(/[\s-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function Avatar({ name, size = 'md', flipId }: { name: string; size?: 'sm' | 'md' | 'lg'; flipId?: string }) {
  return <span className={`avatar avatar--${size}`} data-flip-id={flipId} aria-hidden="true">{initials(name)}</span>;
}

/** Честный статус записи: «сохраняется…» → «в таблице» → «не сохранилось». */
export function SaveBadge({ state }: { state: SaveState | undefined }) {
  if (!state) return null;
  return (
    <span className={`save save--${state}`} role="status">
      {state === 'saving' && <><span className="save__pulse" aria-hidden="true" />сохраняется…</>}
      {state === 'saved' && <><Icon name="check" size={16} />в таблице</>}
      {state === 'failed' && <><Icon name="alert" size={16} />не сохранилось</>}
    </span>
  );
}

/** Вкладки: индикатор переезжает под выбранную (transform, 220 мс). */
export function Tabs<T extends string>({ items, value, onChange, label }: {
  items: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; label: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const ind = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const btn = wrap.current?.querySelector<HTMLElement>(`[data-tab="${value}"]`);
    if (!btn || !ind.current) return;
    ind.current.style.transform = `translateX(${btn.offsetLeft}px)`;
    ind.current.style.width = `${btn.offsetWidth}px`;
  }, [value, items]);
  return (
    <div ref={wrap} className="tabs" role="tablist" aria-label={label}>
      <span ref={ind} className="tabs__ind" aria-hidden="true" />
      {items.map((it) => (
        <button key={it.id} type="button" role="tab" data-tab={it.id} aria-selected={it.id === value}
          className="tabs__tab" onClick={() => onChange(it.id)}>
          {it.label}{it.count !== undefined && <span className="tabs__count num">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}
