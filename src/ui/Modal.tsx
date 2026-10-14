// Окно на основе <dialog>: фокус остаётся внутри, Esc закрывает, фон недоступен — это даёт сам браузер.
// Вид: «dialog» — по центру (ноутбук) / шторка снизу (телефон); «panel» — выезжает справа (карточка клиента).
import { useId, useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';

const CLOSE_MS = 180; // уход быстрее появления (навык animate: асимметрия)

export function Modal({ open, onClose, title, kind = 'dialog', children, footer, labelledBy }: {
  open: boolean;
  onClose: () => void;
  title?: string;
  kind?: 'dialog' | 'panel';
  children: ReactNode;
  footer?: ReactNode;
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // Синхронно (layout effect): окно должно открыться в том же кадре, что снимает плавный переход.
  useLayoutEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      // Окно вырастает из кнопки, которой его открыли (как в «Сверке рейсов»): точка роста — середина кнопки.
      const from = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement.getBoundingClientRect() : null;
      d.classList.remove('is-closing');
      d.showModal();
      const box = d.querySelector<HTMLElement>('.modal__box');
      if (box && from && from.width > 0) {
        const b = box.getBoundingClientRect();
        box.style.transformOrigin = `${from.left + from.width / 2 - b.left}px ${from.top + from.height / 2 - b.top}px`;
      } else if (box) box.style.transformOrigin = '';
    } else if (!open && d.open) {
      d.classList.add('is-closing');
      const t = window.setTimeout(() => { d.close(); d.classList.remove('is-closing'); }, CLOSE_MS);
      return () => window.clearTimeout(t);
    }
  }, [open]);
  return (
    <dialog ref={ref} className={`modal modal--${kind}`} aria-labelledby={labelledBy ?? (title ? titleId : undefined)}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="modal__box">
        {title && (
          <header className="modal__head">
            <span className="modal__grip" aria-hidden="true" />
            <h2 id={titleId} className="modal__title">{title}</h2>
            <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}><Icon name="close" /></button>
          </header>
        )}
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__foot">{footer}</footer>}
      </div>
    </dialog>
  );
}
