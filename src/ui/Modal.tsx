// Окно на основе <dialog>: фокус остаётся внутри, Esc закрывает, фон недоступен — это даёт сам браузер.
// Вид: «dialog» — по центру (ноутбук) / шторка снизу (телефон); «panel» — выезжает справа (карточка клиента).
import { useLayoutEffect, useRef } from 'react';
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
  // Синхронно (layout effect): окно должно открыться в том же кадре, что снимает плавный переход.
  useLayoutEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.classList.remove('is-closing');
      d.showModal();
    } else if (!open && d.open) {
      d.classList.add('is-closing');
      const t = window.setTimeout(() => { d.close(); d.classList.remove('is-closing'); }, CLOSE_MS);
      return () => window.clearTimeout(t);
    }
  }, [open]);
  return (
    <dialog ref={ref} className={`modal modal--${kind}`} aria-labelledby={labelledBy ?? (title ? 'modal-title' : undefined)}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="modal__box">
        {title && (
          <header className="modal__head">
            <span className="modal__grip" aria-hidden="true" />
            <h2 id="modal-title" className="modal__title">{title}</h2>
            <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}><Icon name="close" /></button>
          </header>
        )}
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__foot">{footer}</footer>}
      </div>
    </dialog>
  );
}
