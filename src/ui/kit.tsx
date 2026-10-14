// Мелкие общие элементы: число с пересчётом, значок статуса, инициалы, вкладки со скользящим индикатором.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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

/**
 * Число-барабан: каждая цифра прокручивается к новому значению (как на табло банка), справа налево с шагом 35 мс.
 * При первом показе цифры прокручиваются от нуля. Только transform; при «уменьшить движение» — сразу.
 */
export function RollingNumber({ value, format = (n) => String(Math.round(n)), className = '' }: {
  value: number; format?: (n: number) => string; className?: string;
}) {
  const text = format(value);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  const chars = text.split('');
  let digitIndex = 0;
  const totalDigits = chars.filter((c) => /\d/.test(c)).length;
  // Сумма «20 700,00 ₴»: копейки и знак — мельче и тише (класс roll__cents).
  const cents = /,\d{2}(\s₴)?$/.test(text) ? text.lastIndexOf(',') : -1;
  return (
    <span className={`roll num ${className}`} role="img" aria-label={text}>
      {chars.map((ch, i) => {
        const fromRight = chars.length - i;
        const tail = cents >= 0 && i >= cents ? ' roll__cents' : '';
        if (!/\d/.test(ch)) return <span key={`s${fromRight}`} className={`roll__sep${tail}`} aria-hidden="true">{ch}</span>;
        const d = ready ? Number(ch) : 0;
        const order = totalDigits - digitIndex++;
        return (
          <span key={`d${fromRight}`} className={`roll__col${tail}`} aria-hidden="true">
            <span className="roll__strip" style={{ transform: `translateY(${-d * 10}%)`, transitionDelay: `${order * 35}ms` }}>
              {'0123456789'.split('').map((n) => <span key={n}>{n}</span>)}
            </span>
            <span className="roll__ghost">{ch}</span>
          </span>
        );
      })}
    </span>
  );
}

/** Сумма без движения: «20 700» крупно, «,00 ₴» — мельче и тише. */
export function Money({ text, className = '' }: { text: string; className?: string }) {
  const at = /,\d{2}(\s₴)?$/.test(text) ? text.lastIndexOf(',') : -1;
  if (at < 0) return <span className={`money-v num ${className}`}>{text}</span>;
  return <span className={`money-v num ${className}`}>{text.slice(0, at)}<span className="money-v__cents">{text.slice(at)}</span></span>;
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

export function Avatar({ name, size = 'md', clientId }: { name: string; size?: 'sm' | 'md' | 'lg'; clientId?: string }) {
  return <span className={`avatar avatar--${size}`} data-client-avatar={clientId} aria-hidden="true">{initials(name)}</span>;
}

/** Честный статус записи: «сохраняется…» → «в таблице» → «не сохранилось». */
export function SaveBadge({ state, offline = false, onRetry }: { state: SaveState | undefined; offline?: boolean; onRetry?: () => void }) {
  if (!state) return null;
  if (state === 'failed' && onRetry) {
    return <button type="button" className="save save--failed save--btn" onClick={onRetry}><Icon name="alert" size={16} />не сохранилось — повторить</button>;
  }
  return (
    <span className={`save save--${state}${state === 'saving' && offline ? ' save--offline' : ''}`} role="status">
      {state === 'saving' && offline && <><Icon name="offline" size={16} />ждёт связи</>}
      {state === 'saving' && !offline && <><span className="save__pulse" aria-hidden="true" />сохраняется…</>}
      {state === 'saved' && <><Icon name="check" size={16} />в таблице</>}
      {state === 'failed' && <><Icon name="alert" size={16} />не сохранилось</>}
    </span>
  );
}

/** Переключатель (фильтр, раздел карточки): индикатор переезжает под выбранный пункт (transform, 220 мс). */
export function Tabs<T extends string>({ items, value, onChange, label }: {
  items: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; label: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const ind = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const btn = wrap.current?.querySelector<HTMLElement>(`[data-tab="${value}"]`);
    if (!ind.current) return;
    // Выбрано то, чего нет среди вкладок (например, фильтр плашкой «Просрочено»), — индикатор прячется.
    ind.current.style.opacity = btn ? '1' : '0';
    if (!btn) return;
    ind.current.style.transform = `translateX(${btn.offsetLeft}px)`;
    ind.current.style.width = `${btn.offsetWidth}px`;
  }, [value, items]);
  return (
    <div ref={wrap} className="tabs" role="group" aria-label={label}>
      <span ref={ind} className="tabs__ind" aria-hidden="true" />
      {items.map((it) => (
        <button key={it.id} type="button" data-tab={it.id} aria-pressed={it.id === value}
          className="tabs__tab" onClick={() => onChange(it.id)}>
          {it.label}{it.count !== undefined && <span className="tabs__count num">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}
