// Уведомления: «Платёж записан в таблицу» + «Отменить» (10 с). Таймер стоит, пока курсор на уведомлении
// или вкладка скрыта. Ошибка не исчезает сама.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';
import type { IconName } from './Icon';

export interface ToastInput {
  text: string;
  tone?: 'ok' | 'error' | 'info';
  action?: { label: string; run: () => void };
  /** мс; по умолчанию 5 с, с действием «Отменить» — 10 с (бриф, п. 4), ошибка — без таймера. */
  timeout?: number;
}
interface ToastItem extends ToastInput { id: number; leaving?: boolean }

const Ctx = createContext<(t: ToastInput) => void>(() => undefined);

const ICON: Record<NonNullable<ToastInput['tone']>, IconName> = { ok: 'check', error: 'alert', info: 'sync' };

function Toast({ t, index, onClose }: { t: ToastItem; index: number; onClose: (id: number) => void }) {
  const total = t.timeout ?? (t.tone === 'error' ? 0 : t.action ? 10_000 : 5000);
  const left = useRef(total);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!total || paused) return;
    const started = Date.now();
    const timer = window.setTimeout(() => onClose(t.id), left.current);
    return () => {
      window.clearTimeout(timer);
      left.current -= Date.now() - started;
    };
  }, [paused, total, t.id, onClose]);
  useEffect(() => {
    const vis = () => setPaused(document.hidden);
    document.addEventListener('visibilitychange', vis);
    return () => document.removeEventListener('visibilitychange', vis);
  }, []);
  return (
    <div className={`toast toast--${t.tone ?? 'ok'}${t.leaving ? ' is-leaving' : ''}`} role={t.tone === 'error' ? 'alert' : 'status'}
      style={{ '--i': index } as React.CSSProperties}
      onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(document.hidden)}>
      <Icon name={ICON[t.tone ?? 'ok']} size={18} className="toast__icon" />
      <span className="toast__text">{t.text}</span>
      {t.action && (
        <button type="button" className="toast__action" onClick={() => { t.action?.run(); onClose(t.id); }}>{t.action.label}</button>
      )}
      <button type="button" className="toast__close" aria-label="Скрыть" onClick={() => onClose(t.id)}><Icon name="close" size={16} /></button>
      {total > 0 && <span className="toast__timer" style={{ animationDuration: `${total}ms`, animationPlayState: paused ? 'paused' : 'running' }} aria-hidden="true" />}
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const close = useCallback((id: number) => {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    window.setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 180);
  }, []);
  const push = useCallback((t: ToastInput) => {
    setItems((xs) => [...xs.slice(-2), { ...t, id: Date.now() + Math.random() }]);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t, i) => <Toast key={t.id} t={t} index={items.length - 1 - i} onClose={close} />)}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}
