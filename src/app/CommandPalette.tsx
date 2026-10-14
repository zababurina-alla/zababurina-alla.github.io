// Командная строка (Ctrl+K): найти клиента, раздел или действие и выполнить с клавиатуры.
// Открывается мгновенно, без анимации: действие частое и с клавиатуры (правило навыка animate).
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../data/store';
import { kindLabel } from '../data/fake';
import { fold, search } from '../lib/search';
import { navigate } from '../router';
import { toggleTheme } from '../lib/theme';
import { Icon } from '../ui/Icon';
import type { IconName } from '../ui/Icon';
import { useUi } from './ui-context';


interface Item { id: string; group: string; label: string; hint?: string; icon: IconName; run: () => void }

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useStore();
  const ui = useUi();
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);

  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) { setLastOpen(open); if (open) { setQ(''); setActive(0); } }

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { d.showModal(); input.current?.focus(); }
    if (!open && d.open) d.close();
  }, [open]);

  const actions: Item[] = [
    { id: 'pay', group: 'Действия', label: 'Записать платёж', hint: 'Alt N', icon: 'plus', run: () => ui.openPayment() },
    { id: 'add', group: 'Действия', label: 'Добавить клиента', icon: 'userPlus', run: ui.openAddClient },
    { id: 'theme', group: 'Действия', label: 'Сменить тему', icon: 'moon', run: toggleTheme },
    { id: 'r-today', group: 'Разделы', label: 'Сегодня', icon: 'today', run: () => navigate('#/today') },
    { id: 'r-clients', group: 'Разделы', label: 'Клиенты', icon: 'clients', run: () => navigate('#/clients') },
    { id: 'r-deadlines', group: 'Разделы', label: 'Сроки', icon: 'deadlines', run: () => navigate('#/deadlines') },
    { id: 'r-payments', group: 'Разделы', label: 'Платежи', icon: 'payments', run: () => navigate('#/payments') },
    { id: 'r-keys', group: 'Разделы', label: 'Ключи ЭЦП', icon: 'keys', run: () => navigate('#/keys') },
    { id: 'r-ref', group: 'Разделы', label: 'Справочник', icon: 'reference', run: () => navigate('#/reference') },
  ];
  const clients: Item[] = q
    ? search(store.clients.map((c) => ({ ...c, extra: [...c.kved.map((k) => k.code), c.phone] })), q).slice(0, 6)
      .map((c) => ({ id: c.id, group: 'Клиенты', label: c.name, hint: kindLabel(c.kind), icon: 'fop' as IconName, run: () => ui.openClient(c.id) }))
    : [];
  const items = [...clients, ...actions.filter((a) => !q || fold(a.label).includes(fold(q)))];

  function run(it: Item | undefined) {
    if (!it) return;
    onClose();
    // Окно закрывается, потом действие — чтобы новое окно (карточка, платёж) не открылось под палитрой.
    window.setTimeout(it.run, 0);
  }

  return (
    <dialog ref={ref} className="palette" aria-label="Командная строка"
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="palette__box">
        <label className="palette__search">
          <Icon name="search" />
          <span className="visually-hidden">Что найти</span>
          <input ref={input} value={q} placeholder="Клиент, раздел или действие…" autoComplete="off"
            role="combobox" aria-expanded={items.length > 0} aria-controls="palette-list" aria-activedescendant={items[active] ? `pal-${active}` : undefined}
            onChange={(e) => { setQ(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              if (e.key === 'Enter') { e.preventDefault(); run(items[active]); }
            }} />
          <kbd className="kbd">Esc</kbd>
        </label>
        <div id="palette-list" className="palette__list" role="listbox" aria-label="Результаты">
          {[...new Set(items.map((it) => it.group))].map((g) => (
            <div key={g} role="group" aria-labelledby={`palg-${g}`}>
              <p id={`palg-${g}`} className="palette__group" role="presentation">{g}</p>
              {items.map((it, i) => it.group === g && (
                <div key={it.id} id={`pal-${i}`} role="option" aria-selected={i === active} className="palette__item"
                  onMouseMove={() => setActive(i)} onClick={() => run(it)}>
                  <Icon name={it.icon} />
                  <span className="palette__label">{it.label}</span>
                  {it.hint && <span className="sub">{it.hint}</span>}
                </div>
              ))}
            </div>
          ))}
          {items.length === 0 && <p className="palette__empty sub">Ничего не нашли по «{q}»</p>}
        </div>
      </div>
    </dialog>
  );
}
