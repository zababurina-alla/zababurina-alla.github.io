// «Клиенты»: поиск в любом падеже, фильтр по типу, таблица; нажатие на строку — карточка справа.
import { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { KIND_LABEL } from '../data/fake';
import { useStore } from '../data/store';
import type { ClientKind, Deadline } from '../data/types';
import { TODAY, daysBetween, daysLabel, fmtDate, plural, statusByDays } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { search } from '../lib/search';
import { Icon } from '../ui/Icon';
import { Avatar, StatusPill, Tabs, reducedMotion } from '../ui/kit';
import { useUi } from '../app/ui-context';

type KindFilter = 'all' | 'fop1' | 'fop2' | 'fop3' | 'other';

export function Clients({ focusSearch }: { focusSearch: boolean }) {
  const store = useStore();
  const ui = useUi();
  const scope = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');

  useEffect(() => { if (focusSearch) input.current?.focus(); }, [focusSearch]);

  useGSAP(() => {
    if (reducedMotion()) return;
    gsap.from('.reveal', { y: 14, opacity: 0, duration: 0.45, stagger: 0.05, ease: 'power3.out', clearProps: 'transform,opacity' });
  }, { scope });

  // Ближайший срок каждого клиента — один проход по срокам, а не перебор на каждую строку.
  const deadlines = store.deadlines;
  const nextByClient = useMemo(() => {
    const m = new Map<string, Deadline>();
    for (const d of deadlines) {
      const cur = m.get(d.clientId);
      if (!cur || d.due < cur.due) m.set(d.clientId, d);
    }
    return m;
  }, [deadlines]);

  const byKind = (k: ClientKind) => kind === 'all' || k === kind || (kind === 'other' && (k === 'general' || k === 'tov'));
  const found = search(
    store.clients.filter((c) => byKind(c.kind)).map((c) => ({ ...c, extra: [...c.kved.map((k) => k.code), c.phone] })),
    q,
  );
  const count = (f: KindFilter) => store.clients.filter((c) => f === 'all' || c.kind === f || (f === 'other' && (c.kind === 'general' || c.kind === 'tov'))).length;

  return (
    <div ref={scope} className="page">
      <header className="page__head reveal">
        <div>
          <h1 className="page__title">Клиенты</h1>
          <p className="page__sub">{store.clients.length} {plural(store.clients.length, 'клиент', 'клиента', 'клиентов')} в таблице</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={ui.openAddClient}><Icon name="userPlus" />Добавить клиента</button>
      </header>

      <section className="panel reveal" aria-label="Список клиентов">
        <div className="toolbar">
          <label className="search-input">
            <Icon name="search" />
            <span className="visually-hidden">Поиск клиента</span>
            <input ref={input} type="search" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Фамилия в любом падеже, КВЕД или телефон…" spellCheck={false} autoComplete="off" />
            <kbd className="kbd">Ctrl K</kbd>
          </label>
          <Tabs label="Тип клиента" value={kind} onChange={setKind} items={[
            { id: 'all', label: 'Все', count: count('all') },
            { id: 'fop1', label: '1 гр.', count: count('fop1') },
            { id: 'fop2', label: '2 гр.', count: count('fop2') },
            { id: 'fop3', label: '3 гр.', count: count('fop3') },
            { id: 'other', label: 'ТОВ и общая', count: count('other') },
          ]} />
        </div>
        {q && <p className="found sub" role="status">Найдено {found.length} из {store.clients.length}</p>}

        <div className="ctable" role="table" aria-label="Клиенты">
          <div className="ctable__head" role="row">
            <span role="columnheader">Клиент</span>
            <span role="columnheader">КВЕД</span>
            <span role="columnheader" className="ta-r">В месяц</span>
            <span role="columnheader">Ключ ЭЦП</span>
            <span role="columnheader">Ближайший срок</span>
          </div>
          {found.map((c) => {
            const month = c.monthly.reduce((s, m) => s + m.kopecks, 0);
            const keyDays = c.keyUntil ? daysBetween(TODAY, c.keyUntil) : null;
            const next = nextByClient.get(c.id);
            const nextDays = next ? daysBetween(TODAY, next.due) : null;
            return (
              <div key={c.id} className="ctable__row" role="row">
                <span role="cell" className="ctable__client">
                  <Avatar name={c.name} clientId={c.id} />
                  <span className="ctable__who">
                    {/* Вся строка нажимается через растянутую зону этой кнопки (::after) — для диктора это одна кнопка с именем */}
                    <button type="button" className="ctable__open" onClick={() => ui.openClient(c.id)}>
                      <strong data-client-name={c.id}>{c.name}</strong>
                    </button>
                    <span className="sub">{KIND_LABEL[c.kind]}{c.employer ? ', работодатель' : ''}</span>
                  </span>
                </span>
                <span role="cell" className="num">{c.kved.map((k) => k.code).join(', ')}</span>
                <span role="cell" className="ta-r num">{month ? formatMoney(month) : <span className="sub">по доходу</span>}</span>
                <span role="cell">{keyDays === null ? <span className="sub">нет</span> : keyDays <= 30
                  ? <StatusPill status={statusByDays(keyDays)}>{daysLabel(keyDays).replace('через ', '')}</StatusPill>
                  : <span className="num">{fmtDate(c.keyUntil ?? '')}</span>}</span>
                <span role="cell">{next && nextDays !== null
                  ? <span className="ctable__next"><span className={`dot dot--${statusByDays(nextDays)}`} aria-hidden="true" /><span>{next.what}<span className="sub">{daysLabel(nextDays)}</span></span></span>
                  : <span className="sub">—</span>}</span>
              </div>
            );
          })}
          {found.length === 0 && (
            <div className="empty">
              <p>{q ? `Никого не нашли по «${q}».` : 'Клиентов этого типа пока нет.'}</p>
              <button type="button" className="btn btn--secondary" onClick={ui.openAddClient}><Icon name="userPlus" />Добавить клиента</button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
