// «Клиенты»: поиск в любом падеже, фильтр по типу, таблица; нажатие на строку — карточка справа.
// Пустое поле из таблицы остаётся пустым и называет причину («ключа нет», «КВЕД не указан»).
import { useEffect, useMemo, useRef, useState } from 'react';
import { NO_PAY_DAYS, lastPaid, noPaymentFor } from '../lib/noPayment';
import type { NoPayDays } from '../lib/noPayment';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { kindLabel } from '../data/fake';
import { useStore } from '../data/store';
import type { ClientKind, DatedDeadline } from '../data/types';
import { TODAY, daysBetween, daysLabel, fmtDate, statusByDays } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { search } from '../lib/search';
import { play } from '../lib/sound';
import { Icon } from '../ui/Icon';
import { Avatar, Money, Tabs, reducedMotion } from '../ui/kit';
import { clientPhoto } from '../ui/photo';
import { Empty } from '../ui/Empty';
import { useUi } from '../app/ui-context';
import { roAttrs } from '../ui/readonly';
import { URGENCY_ICON } from './DeadlineTable';
import { TableText } from '../ui/TableText';
import { KvedCell } from './KvedCell';
import { useFlipRows } from '../ui/flip';

type KindFilter = 'all' | 'fop1' | 'fop2' | 'fop3' | 'other';

export function Clients({ focusSearch }: { focusSearch: boolean }) {
  const store = useStore();
  const ui = useUi();
  const scope = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  // «Без телефона»: бот узнаёт клиента в Telegram по телефону — у кого его нет, тому бот не пишет (просьба «Связи»).
  const [noPhone, setNoPhone] = useState(false);
  const phoneless = store.clients.filter((c) => !c.phone.trim()).length;
  // «Без платежа N дней» (бот: find_no_payment): по платежам снимка — он держит 90 дней, поэтому N — 30, 60 или 90.
  const [noPay, setNoPay] = useState<NoPayDays | null>(null);
  const paidLast = useMemo(() => lastPaid(store.payments), [store.payments]);
  const unpaid = (days: number) => store.clients.filter((c) => noPaymentFor(paidLast, c.id, days, TODAY)).length;

  useEffect(() => { if (focusSearch) input.current?.focus(); }, [focusSearch]);

  useGSAP(() => {
    if (reducedMotion()) return;
    gsap.from('.reveal', { y: 14, opacity: 0, duration: 0.5, stagger: 0.05, ease: 'power3.out', clearProps: 'transform,opacity' });
  }, { scope });

  // Ближайший срок каждого клиента — один проход по срокам, а не перебор на каждую строку.
  const deadlines = store.deadlines;
  const nextByClient = useMemo(() => {
    const m = new Map<string, DatedDeadline>();
    for (const d of deadlines) {
      const cur = m.get(d.clientId);
      if (!cur || d.due < cur.due) m.set(d.clientId, d);
    }
    return m;
  }, [deadlines]);

  // Тип не указан (null) — в «Другие».
  const isOther = (k: ClientKind | null) => !['fop1', 'fop2', 'fop3'].includes(k ?? '');
  const byKind = (k: ClientKind | null, f: KindFilter) => f === 'all' || k === f || (f === 'other' && isOther(k));
  const found = search(
    store.clients.filter((c) => byKind(c.kind, kind) && (!noPhone || !c.phone.trim()) && (noPay === null || paidLast.size === 0 || noPaymentFor(paidLast, c.id, noPay, TODAY))).map((c) => ({ ...c, extra: [...c.kved.map((k) => k.code), c.phone],
      words: [...c.kved.map((k) => k.title), c.keyIssuer, ...store.deadlines.filter((d) => d.clientId === c.id).map((d) => d.what)] })),
    q,
  );

  // Перестановка строк при поиске и фильтрах — плавно (FLIP): строки, что остались, переезжают на новые места, а не
  // прыгают; новые появляются лесенкой (row-in в CSS). Ключ — порядок клиентов, чтобы не дёргать при прочих обновлениях.
  const table = useRef<HTMLDivElement>(null);
  useFlipRows(table, '.ctable__row', found.map((c) => c.id).join(','));
  const count = (f: KindFilter) => store.clients.filter((c) => byKind(c.kind, f)).length;
  const total = store.clients.length;

  return (
    <div ref={scope} className="page">
      <header className="page__head reveal">
        <div>
          <h1 className="page__title">Клиенты <em>{total} в таблице</em></h1>
        </div>
        <button type="button" className="btn btn--primary" onClick={ui.openAddClient} {...roAttrs('clients')}><Icon name="userPlus" />Добавить клиента</button>
      </header>

      <section className="panel reveal" aria-label="Список клиентов">
        <div className="toolbar clients__bar">
          <label className="search-input search-input--lg">
            <Icon name="search" size={22} />
            <span className="visually-hidden">Поиск клиента</span>
            <input ref={input} type="search" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Фамилия, КВЕД, телефон…" title="Ищет по фамилии, КВЕД, телефону, банку ключа и отчёту" spellCheck={false} autoComplete="off" />
            {q ? <span className="search-input__count num" role="status">{found.length} из {total}</span> : <kbd className="kbd">/</kbd>}
          </label>
          {/* Отбор (владелец 16.10: «фильтры в две строки, справа пустая полоса»): две ровные строки во всю ширину —
              поиск + «Без платежа 30 · 60 · 90», тип клиента + «Без телефона». Каждый блок растягивается, пустых полос нет.
              «Без платежа» — только когда в снимке есть полученные платежи (техника 16.10: статус пустой → «ожидается»,
              фильтр показал бы всех); без него поиск — первой строкой целиком. */}
          {paidLast.size > 0 && <div className="seg seg--fill clients__nopay" role="group" aria-label="Без платежа">
            <span className="clients__nopay-label" aria-hidden="true"><Icon name="payments" size={16} /><span>Без платежа<span className="clients__nopay-unit">, дн.</span></span></span>
            {NO_PAY_DAYS.map((n) => (
              <button key={n} type="button" className="seg__opt" aria-pressed={noPay === n} onClick={() => { setNoPay((v) => (v === n ? null : n)); play('tick'); }}
                aria-label={`Без платежа больше ${n} дней: ${unpaid(n)}`}
                title={n === 90 ? 'Ни одного полученного платежа за 90 дней (столько держит снимок)' : `Последний полученный платёж — больше ${n} дней назад`}>
                {n}<span className="clients__nopay-days"> дн.</span><span className="chip__n num">{unpaid(n)}</span>
              </button>
            ))}
          </div>}
          <Tabs label="Тип клиента" value={kind} onChange={(k) => { setKind(k); play('tick'); }} items={[
            { id: 'all', label: 'Все', count: count('all') },
            { id: 'fop1', label: '1 гр.', count: count('fop1') },
            { id: 'fop2', label: '2 гр.', count: count('fop2') },
            { id: 'fop3', label: '3 гр.', count: count('fop3') },
            { id: 'other', label: 'ТОВ, общая и др.', count: count('other') },
          ]} />
          {phoneless > 0 && (
            <button type="button" className="chip clients__nophone" aria-pressed={noPhone} onClick={() => { setNoPhone((v) => !v); play('tick'); }}>
              <Icon name="call" size={16} />Без телефона<span className="chip__n num">{phoneless}</span>
            </button>
          )}
        </div>

        <div ref={table} className="ctable" role="table" aria-label="Клиенты">
          <div className="ctable__head" role="row">
            <span role="columnheader">Клиент</span>
            <span role="columnheader">КВЕД</span>
            <span role="columnheader" className="ta-r">В месяц</span>
            <span role="columnheader">Ключ ЭЦП</span>
            <span role="columnheader">Ближайший срок</span>
          </div>
          {found.map((c, i) => {
            const month = c.monthly.reduce((s, m) => s + (m.kopecks ?? 0), 0);
            const keyDays = c.keyUntil ? daysBetween(TODAY, c.keyUntil) : null;
            const keySt = keyDays === null ? null : statusByDays(keyDays);
            const next = nextByClient.get(c.id);
            const nextDays = next ? daysBetween(TODAY, next.due) : null;
            const nextSt = nextDays === null ? null : statusByDays(nextDays);
            return (
              <div key={c.id} className="ctable__row" role="row" style={{ '--i': i } as React.CSSProperties}>
                <span role="cell" className="ctable__client">
                  <Avatar name={c.name} clientId={c.id} photo={clientPhoto(c)} />
                  <span className="ctable__who">
                    {/* Вся строка нажимается через растянутую зону этой кнопки (::after) — для диктора это одна кнопка с именем */}
                    <button type="button" className="ctable__open" onClick={() => ui.openClient(c.id)}>
                      <strong data-client-name={c.id}>{c.name}</strong>
                    </button>
                    <span className="sub">{c.kind ? kindLabel(c.kind) : <span className="nil">тип не указан</span>}{c.employer ? ', работодатель' : ''}
                      {month > 0 && <span className="ctable__month-inline"> · <Money text={formatMoney(month)} /> в месяц</span>}</span>
                  </span>
                </span>
                <span role="cell" className="ctable__kved"><KvedCell c={c} /></span>
                <span role="cell" className="ta-r ctable__sum">{month ? <Money text={formatMoney(month)} /> : <span className="nil" title={c.monthly.map((m) => m.note).filter(Boolean).join('; ') || undefined}>не посчитано</span>}</span>
                <span role="cell" className="ctable__key">
                  {keyDays === null || !keySt
                    ? <span className="ctable__state"><Icon name="inactive" size={18} className="urgency--grey" /><span className="nil">{c.keyIssuer.trim() ? 'срок не указан' : 'ключа нет'}</span></span>
                    : <span className="ctable__state"><Icon name={URGENCY_ICON[keySt]} size={18} className={`urgency--${keySt}`} />
                      <span className="ctable__state-text">{keyDays <= 30 ? <span className={`due--${keySt}`}>{daysLabel(keyDays).replace('через ', 'ещё ')}</span> : null}<span className="sub num">до {fmtDate(c.keyUntil ?? '')}</span></span></span>}
                </span>
                <span role="cell" className="ctable__next">
                  {next && nextDays !== null && nextSt
                    ? <span className="ctable__state"><Icon name={URGENCY_ICON[nextSt]} size={18} className={`urgency--${nextSt}`} />
                      <span className="ctable__state-text"><TableText text={next.what} icon={false} /><span className={`sub due--${nextSt}`}>{daysLabel(nextDays)}</span></span></span>
                    : <span className="sub">открытых сроков нет</span>}
                </span>
              </div>
            );
          })}
          {found.length === 0 && (
            <Empty pic="search" title={q ? `Никого не нашли по «${q}»` : 'Клиентов этого типа пока нет'} action={
              <button type="button" className="btn btn--secondary" onClick={ui.openAddClient} {...roAttrs('clients')}><Icon name="userPlus" />Добавить клиента</button>
            }>{q ? 'Проверьте букву или попробуйте часть фамилии — падеж и украинские буквы не важны.' : null}</Empty>
          )}
        </div>
      </section>
    </div>
  );
}
