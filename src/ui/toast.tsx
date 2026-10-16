// Уведомления: «Платёж записан в таблицу» + «Отменить» (10 с). Таймер стоит, пока курсор на уведомлении
// или вкладка скрыта. Ошибка не исчезает сама. Смахнуть в сторону — закрыть (как в Telegram).
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { demoWords } from '../config';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { Avatar } from './kit';

export interface ToastInput {
  text: string;
  tone?: 'ok' | 'error' | 'info';
  action?: { label: string; run: () => void };
  /** Вторая кнопка, тише главной: «Не писать клиенту» рядом с «Вернуть срок». */
  secondary?: { label: string; run: () => void };
  /** мс; по умолчанию 5 с, с действием «Отменить» — 10 с (бриф, п. 4), ошибка — без таймера. */
  timeout?: number;
  /** Одно и то же событие (например, отказ по одной записи) — одно уведомление, даже если о нём сообщили дважды. */
  key?: string;
  /** С тем же key — заменить текст на месте («Записываю…» → «Записано · Отменить»), таймер — заново. */
  replace?: boolean;
  /** Сообщение клиента — как в Telegram: аватар, имя и время над текстом; нажатие на уведомление — действие (открыть). */
  from?: { name: string; at: string };
}
interface ToastItem extends ToastInput { id: number; leaving?: boolean }

const Ctx = createContext<(t: ToastInput) => void>(() => undefined);

const ICON: Record<NonNullable<ToastInput['tone']>, IconName> = { ok: 'check', error: 'alert', info: 'sync' };

function Toast({ t, index, onClose }: { t: ToastItem; index: number; onClose: (id: number) => void }) {
  const total = t.timeout ?? (t.tone === 'error' ? 0 : t.action ? 10_000 : 5000);
  const left = useRef(total);
  const [paused, setPaused] = useState(false);
  // Заменили текст (replace) — отсчёт заново: «Записано · Отменить» должно висеть своё время целиком.
  useEffect(() => { left.current = total; }, [t.text, total]);
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
  // Смахнуть: ведём пальцем/мышью по уведомлению — оно едет следом; дальше 80 px — закрыто, ближе — пружиной назад.
  const drag = useRef<{ x: number; id: number } | null>(null);
  const [dx, setDx] = useState(0);
  const swipe = {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      if ((e.target as Element).closest('button')) return;
      drag.current = { x: e.clientX, id: e.pointerId };
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      const moved = e.clientX - d.x;
      if (Math.abs(moved) > 6 && !e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.setPointerCapture(e.pointerId);
      setDx(moved);
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      const moved = e.clientX - d.x;
      if (Math.abs(moved) > 80) { onClose(t.id); return; }
      setDx(0);
      // Без движения — это нажатие: у сообщения клиента нажатие на уведомление открывает диалог.
      if (Math.abs(moved) < 6 && t.from && t.action) { t.action.run(); onClose(t.id); }
    },
    onPointerCancel: () => { drag.current = null; setDx(0); },
  };
  return (
    <div className={`toast toast--${t.tone ?? 'ok'}${t.from ? ' toast--message' : ''}${!t.from && t.action && (t.secondary || t.text.length + t.action.label.length > 70) ? ' toast--stack' : ''}${t.leaving ? ' is-leaving' : ''}${dx ? ' is-dragging' : ''}`} role={t.tone === 'error' ? 'alert' : 'status'}
      style={{ '--i': index, '--dx': `${dx}px`, '--drag-o': String(Math.max(0.2, 1 - Math.abs(dx) / 220)) } as React.CSSProperties}
      onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(document.hidden)}
      onFocus={() => setPaused(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setPaused(document.hidden); }}
      {...swipe}>
      {t.from ? <Avatar name={t.from.name} /> : <Icon name={ICON[t.tone ?? 'ok']} size={18} className="toast__icon" />}
      {t.from
        ? <span className="toast__text"><span className="toast__from"><strong>{t.from.name}</strong><time className="num" dateTime={t.from.at}>{t.from.at.slice(11, 16)}</time></span><span className="toast__msg">{t.text}</span></span>
        : <span className="toast__text">{t.text}</span>}
      {t.action && (t.secondary ? (
        <span className="toast__actions">
          <button type="button" className="toast__action" onClick={() => { t.action?.run(); onClose(t.id); }}>{t.action.label}</button>
          <button type="button" className="toast__action toast__action--quiet" onClick={() => { t.secondary?.run(); onClose(t.id); }}>{t.secondary.label}</button>
        </span>
      ) : (
        <button type="button" className="toast__action" onClick={() => { t.action?.run(); onClose(t.id); }}>{t.action.label}</button>
      ))}
      <button type="button" className="toast__close" aria-label="Скрыть" onClick={() => onClose(t.id)}><Icon name="close" size={16} /></button>
      {total > 0 && <span className="toast__timer" style={{ animationDuration: `${total}ms`, animationPlayState: paused ? 'paused' : 'running' }} aria-hidden="true" />}
    </div>
  );
}

/**
 * Слой уведомлений. Пока открыто модальное окно (<dialog>), всё вне его браузер делает недоступным —
 * даже то, что нарисовано поверх. Поэтому уведомления («Не сохранилось — Повторить») рисуются внутри
 * верхнего открытого окна, а без окон — в конце страницы.
 */
function ToastLayer({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const pick = () => setHost([...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].at(-1) ?? null);
    pick();
    // Не чаще раза за кадр: childList срабатывает на любое изменение страницы.
    let raf = 0;
    const mo = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; pick(); }); });
    // childList — окно может не закрыться, а исчезнуть со страницы (карточка при смене экрана): иначе слой оставался
    // в удалённом окне и все уведомления, включая ошибки, переставали быть видны.
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
    return () => { mo.disconnect(); cancelAnimationFrame(raf); };
  }, []);
  return createPortal(<div className="toasts" aria-live="polite">{children}</div>, host ?? document.body);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const close = useCallback((id: number) => {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    window.setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 180);
  }, []);
  const push = useCallback((t: ToastInput) => {
    setItems((xs) => {
      const same = t.key ? xs.find((x) => x.key === t.key && !x.leaving) : undefined;
      if (same) return t.replace ? xs.map((x) => (x === same ? { ...t, text: demoWords(t.text), id: same.id } : x)) : xs;
      return [...xs.slice(-2), { ...t, text: demoWords(t.text), id: Date.now() + Math.random() }];
    });
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <ToastLayer>
        {items.map((t, i) => <Toast key={t.id} t={t} index={items.length - 1 - i} onClose={close} />)}
      </ToastLayer>
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}
