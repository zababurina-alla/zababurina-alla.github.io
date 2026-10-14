// Режим отладки для Дмитрия (Ctrl+Shift+D или ?debug=1): имитация того, что запись изменили в таблице
// или через бота, — чтобы увидеть двустороннюю связь (бриф, п. 6) до живого API. Маме не показывается.
import { useEffect, useState } from 'react';
import { useStore } from '../data/store';
import type { IncomingKind } from '../data/store';
import { Icon } from '../ui/Icon';
import { useToast } from '../ui/toast';

const ACTIONS: { kind: IncomingKind; label: string }[] = [
  { kind: 'payment', label: 'Бот записал платёж' },
  { kind: 'key', label: 'В таблице продлили ключ' },
  { kind: 'close', label: 'Бот закрыл срок' },
];

export function DebugDock() {
  const store = useStore();
  const toast = useToast();
  const [open, setOpen] = useState(() => new URLSearchParams(window.location.search).has('debug'));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyD') { e.preventDefault(); setOpen((o) => !o); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  if (!open) return null;
  return (
    <aside className="debug" aria-label="Отладка">
      <p className="debug__title"><Icon name="settings" size={16} />Отладка: правки извне</p>
      {ACTIONS.map((a) => (
        <button key={a.kind} type="button" className="btn btn--secondary btn--sm"
          onClick={() => toast({ text: store.simulateIncoming(a.kind), tone: 'info' })}>{a.label}</button>
      ))}
      <button type="button" className="link" onClick={() => setOpen(false)}>Скрыть</button>
    </aside>
  );
}
