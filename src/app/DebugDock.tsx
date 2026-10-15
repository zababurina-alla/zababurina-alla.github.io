// Режим отладки для Дмитрия (Ctrl+Shift+D или ?debug=1). Маме не показывается.
// 1) Правки «извне» — как выглядит двусторонняя связь с таблицей (бриф, п. 6) до живого API.
// 2) Рычаги сети: обрыв связи, отказ сервера, конфликт версий.
// 3) Счётчики ступеней записи рядом (правило владельца, п. 2.8): введено → в очереди → отправлено → принято →
//    применено → видно в таблице; плюс курсор изменений.
import { useEffect, useState } from 'react';
import { useStore } from '../data/store';
import type { ExternalKind } from '../data/store';
import { persistent } from '../data/idb';
import { liveApi } from '../data/session';
import type { DiagCounters } from '../data/liveApi';
import { Icon } from '../ui/Icon';
import { useToast } from '../ui/toast';

const EXTERNAL: { kind: ExternalKind; label: string }[] = [
  { kind: 'payment', label: 'Бот записал платёж' },
  { kind: 'key', label: 'В таблице продлили ключ' },
  { kind: 'close', label: 'Бот закрыл срок' },
  { kind: 'phone', label: 'В таблице сменили телефон' },
  { kind: 'inbox', label: 'Клиент написал в Telegram' },
];

export function DebugDock() {
  const store = useStore();
  const toast = useToast();
  const [open, setOpen] = useState(() => new URLSearchParams(window.location.search).has('debug'));
  const [net, setNet] = useState(true);
  const [server, setServer] = useState<DiagCounters | string | null>(null);
  const loadServer = () => {
    setServer('загружаю…');
    liveApi?.diagCounters().then(setServer, (e: unknown) => setServer(e instanceof Error ? e.message : 'не получилось'));
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyD') { e.preventDefault(); setOpen((o) => !o); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  if (!open) return null;
  const c = store.counters;
  const queued = store.pending.filter((p) => p.state === 'queued' || p.state === 'sending').length;
  return (
    <aside className="debug" aria-label="Отладка">
      <p className="debug__title"><Icon name="settings" size={16} />Отладка</p>
      {!liveApi && <>
      <p className="debug__h">Правки извне</p>
      {EXTERNAL.map((a) => (
        <button key={a.kind} type="button" className="btn btn--secondary btn--sm"
          onClick={() => toast({ text: store.external(a.kind), tone: 'info' })}>{a.label}</button>
      ))}
      <p className="debug__h">Сеть и сервер</p>
      <button type="button" className="btn btn--secondary btn--sm"
        onClick={() => { store.setOnline(!net); setNet(!net); }}>
        <Icon name={net ? 'offline' : 'saved'} size={16} />{net ? 'Оборвать связь' : 'Вернуть связь'}
      </button>
      <button type="button" className="btn btn--secondary btn--sm" onClick={() => { store.failNextWrite(); toast({ text: 'Следующая запись получит отказ сервера', tone: 'info' }); }}>
        Отказ на следующей записи
      </button>
      <label className="check"><input type="checkbox" onChange={(e) => store.setSlow(e.target.checked)} />Медленная таблица (12 с)</label>
      <label className="check"><input type="checkbox" onChange={(e) => store.setMaintenance(e.target.checked)} />Ночное обслуживание</label>
      </>}
      <button type="button" className="btn btn--secondary btn--sm" onClick={() => void store.syncNow()}>Синхронизировать сейчас</button>
      <p className="debug__h">Ступени записи</p>
      <dl className="debug__counters num">
        <div><dt>введено</dt><dd>{c.entered}</dd></div>
        <div><dt>в очереди</dt><dd>{queued}</dd></div>
        <div><dt>отправлено</dt><dd>{c.sent}</dd></div>
        <div><dt>принято</dt><dd>{c.accepted}</dd></div>
        <div><dt>отказ</dt><dd>{c.rejected}</dd></div>
        <div><dt>применено</dt><dd>{c.applied}</dd></div>
        <div><dt>видно в таблице</dt><dd>{c.seenInTable}</dd></div>
        <div><dt>курсор</dt><dd>{store.cursor}</dd></div>
      </dl>
      {liveApi && <>
        <p className="debug__h">Сервер за сегодня</p>
        {server && typeof server === 'object' ? (
          <dl className="debug__counters num">
            <div><dt>получено</dt><dd>{server.received}</dd></div>
            <div><dt>применено</dt><dd>{server.applied}</dd></div>
            <div><dt>повторов</dt><dd>{server.repeats}</dd></div>
            <div><dt>отказов</dt><dd>{Object.values(server.rejectedByCode).reduce((s, n) => s + n, 0)}</dd></div>
          </dl>
        ) : server && <p className="sub">{server}</p>}
        <button type="button" className="btn btn--secondary btn--sm" onClick={loadServer}>Счётчики сервера</button>
      </>}
      <p className="sub">Очередь: {persistent ? 'IndexedDB (переживёт перезагрузку)' : 'в памяти — IndexedDB недоступен'}</p>
      <button type="button" className="link" onClick={() => setOpen(false)}>Скрыть</button>
    </aside>
  );
}
