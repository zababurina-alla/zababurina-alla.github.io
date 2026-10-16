// «Сроки»: календарь месяца + список по дням; закрытие одним нажатием, «Закрыто сегодня» с честным статусом.
// Месяц считается от сегодняшней даты и листается ‹ › (раньше был жёстко «Октябрь 2026»).
import { useMemo, useRef, useState, useEffect } from 'react';
import { canWrite, hasFeature } from '../config';
import { roAttrs, roMessage } from '../ui/readonly';
import { useToast } from '../ui/toast';
import { SelectionCtx } from './selection';
import { OBLIGATION_LABEL, obligationKind } from '../lib/obligation';
import type { ObligationKind } from '../lib/obligation';
import type { ClientKind, DatedDeadline, DeadlineStatus } from '../data/types';
import { STATUS_LABEL } from './DeadlineActions';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useStore } from '../data/store';
import type { Status } from '../data/types';
import { TODAY, addDays, daysBetween, daysInMonth, fmtDayMonth, monthKey, monthName, plural, prevMonthKey, statusByDays, fmtDue } from '../lib/dates';
import { play } from '../lib/sound';
import { Icon } from '../ui/Icon';
import { Empty } from '../ui/Empty';
import { SaveBadge, Tabs, reducedMotion } from '../ui/kit';
import { shortName } from '../ui/names';
import { TableText } from '../ui/TableText';
import { DayGroups } from './DayGroups';
import type { GroupBy } from './DayGroups';
import { OBLIGATION_ICON } from '../ui/obligationIcon';
import { useRoute } from '../router';
import { useUi } from '../app/ui-context';
import { WeekLoadBar } from './WeekLoad';

type Range = 'month' | 'overdue' | 'week' | 'all';
const RANK: Record<Status, number> = { red: 4, orange: 3, yellow: 2, green: 1, grey: 0 };

function nextMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number);
  const yy = m === 12 ? (y ?? 1970) + 1 : (y ?? 1970);
  const mm = m === 12 ? 1 : (m ?? 1) + 1;
  return `${yy}-${String(mm).padStart(2, '0')}`;
}

function Month({ picked, onPick }: { picked: string | null; onPick: (iso: string | null) => void }) {
  const { deadlines } = useStore();
  const [key, setKey] = useState(monthKey(TODAY));
  const n = daysInMonth(key);
  const days = Array.from({ length: n }, (_, i) => `${key}-${String(i + 1).padStart(2, '0')}`);
  // Сдвиг первого дня от понедельника: getUTCDay() 0 — воскресенье.
  const lead = (new Date(`${key}-01T00:00:00Z`).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...days];
  const title = `${monthName(key, 'nom')} ${key.slice(0, 4)}`;
  const inMonth = deadlines.filter((d) => d.due.startsWith(key)).length;
  return (
    <div className="month" role="group" aria-label={`${title}, выбор дня`}>
      <div className="month__head">
        <p className="month__title" aria-live="polite">{monthName(key, 'nom')} <em>{key.slice(0, 4)}</em></p>
        <span className="month__nav">
          <button type="button" className="icon-btn" aria-label="Прошлый месяц" onClick={() => { setKey(prevMonthKey(key)); play('tick'); }}><Icon name="chevronLeft" /></button>
          <button type="button" className="icon-btn" aria-label="Следующий месяц" onClick={() => { setKey(nextMonthKey(key)); play('tick'); }}><Icon name="chevronRight" /></button>
        </span>
      </div>
      <div className="month__grid">
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((w) => <span key={w} className="month__wd" aria-hidden="true">{w}</span>)}
        {cells.map((iso, i) => {
          if (!iso) return <span key={`e${i}`} />;
          const due = deadlines.filter((d) => d.due === iso);
          const worst = due.reduce<Status | null>((w, d) => {
            const s = statusByDays(daysBetween(TODAY, d.due));
            return !w || RANK[s] > RANK[w] ? s : w;
          }, null);
          const count = due.length ? `${due.length} ${plural(due.length, 'срок', 'срока', 'сроков')}` : '';
          return (
            <button key={iso} type="button" aria-pressed={picked === iso}
              className={`month__day${iso === TODAY ? ' is-today' : ''}${iso < TODAY ? ' is-past' : ''}${worst ? ` month__day--${worst}` : ''}`}
              title={count || undefined}
              aria-label={`${fmtDayMonth(iso)}${count ? `, ${count}` : ''}${iso === TODAY ? ', сегодня' : ''}`}
              onClick={() => { onPick(picked === iso ? null : iso); play('tick'); }}>
              <span className="num">{Number(iso.slice(8))}</span>
              {due.length > 0 && <span className="month__n" aria-hidden="true">{due.length}</span>}
            </button>
          );
        })}
      </div>
      <p className="month__legend sub">
        <span><Icon name="overdue" size={16} className="urgency--red" />просрочено</span>
        <span><Icon name="burning" size={16} className="urgency--orange" />горит 0–7{' '}дн.</span>
        <span><Icon name="soon" size={16} className="urgency--yellow" />скоро 8–30{' '}дн.</span>
      </p>
      <p className="month__total sub">В этом месяце открытых сроков: <strong className="num">{inMonth}</strong></p>
    </div>
  );
}

type OpenStatus = Exclude<DeadlineStatus, 'done'>;
const OPEN_STATUSES: OpenStatus[] = ['new', 'inProgress', 'waiting', 'postponed'];
type ClientGroup = 'fop' | 'tov' | 'other';
const CLIENT_GROUP_LABEL: Record<ClientGroup, string> = { fop: 'ФОП', tov: 'ТОВ', other: 'Другие' };
function clientGroup(kind: ClientKind | null): ClientGroup {
  if (kind === 'fop1' || kind === 'fop2' || kind === 'fop3' || kind === 'fopGeneral') return 'fop';
  if (kind === 'tov3' || kind === 'tovGeneral') return 'tov';
  return 'other';
}

export function Deadlines() {
  const store = useStore();
  const ui = useUi();
  const scope = useRef<HTMLDivElement>(null);
  const route = useRoute();
  // № 10: «Закрыто сегодня» в меню ведёт сюда (#/deadlines/closed) — к своему блоку, с короткой подсветкой.
  const toClosed = route.params[0] === 'closed';
  useEffect(() => {
    if (!toClosed) return;
    const el = document.getElementById('closed');
    if (!el) return;
    el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    el.focus({ preventScroll: true });
    el.classList.remove('is-flash');
    void el.offsetWidth; // перезапуск подсветки при повторном нажатии
    el.classList.add('is-flash');
  }, [toClosed, store.closed.length]);
  const [range, setRange] = useState<Range>('month');
  const [picked, setPicked] = useState<string | null>(null);
  const [by, setBy] = useState<GroupBy>('day');

  useGSAP(() => {
    if (reducedMotion()) return;
    gsap.from('.reveal', { y: 14, opacity: 0, duration: 0.5, stagger: 0.05, ease: 'power3.out', clearProps: 'transform,opacity' });
  }, { scope });

  const [kindF, setKindF] = useState<ObligationKind | 'all'>('all');
  const [statusF, setStatusF] = useState<OpenStatus | 'all'>('all');
  const [clientF, setClientF] = useState<ClientGroup | 'all'>('all');
  // Фильтры по виду, статусу и типу клиента — поверх периода; счётчики периода считают уже отфильтрованное.
  const passes = (d: DatedDeadline) => (kindF === 'all' || obligationKind(d.what) === kindF)
    && (statusF === 'all' || d.status === statusF)
    && (clientF === 'all' || clientGroup(store.client(d.clientId)?.kind ?? null) === clientF);
  const pool = store.deadlines.filter(passes);
  const filtered = kindF !== 'all' || statusF !== 'all' || clientF !== 'all';
  const fits = (days: number, r: Range) => (r === 'overdue' ? days < 0 : r === 'week' ? days <= 7 : r === 'month' ? days <= 30 : true);
  // Период → (без вида) фишки видов с числами → вид. Статус и тип клиента — фильтры техники сайта (pool).
  const inRange = store.deadlines.filter((d) => (statusF === 'all' || d.status === statusF)
    && (clientF === 'all' || clientGroup(store.client(d.clientId)?.kind ?? null) === clientF)
    && (picked ? d.due === picked : fits(daysBetween(TODAY, d.due), range)));
  const kinds = new Map<ObligationKind, number>();
  for (const d of inRange) kinds.set(obligationKind(d.what), (kinds.get(obligationKind(d.what)) ?? 0) + 1);
  const items = kindF === 'all' ? inRange : inRange.filter((d) => obligationKind(d.what) === kindF);
  const count = (r: Range) => pool.filter((d) => fits(daysBetween(TODAY, d.due), r)).length;

  // «Закрыть N» (п. 5): выбор строк → подтверждение вторым нажатием → deadlines.closeMany пакетами по 20.
  const toast = useToast();
  const [selecting, setSelecting] = useState(false);
  const [pickedIds, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const pickedNow = store.deadlines.filter((d) => pickedIds.has(d.id));
  const selection = useMemo(() => ({
    on: selecting, picked: pickedIds,
    toggle: (id: string) => { setConfirming(false); setChosen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); },
  }), [selecting, pickedIds]);
  const startSelecting = () => {
    if (!canWrite('deadlines')) { toast({ text: roMessage('deadlines'), tone: 'info' }); return; }
    setSelecting(true); setChosen(new Set()); setConfirming(false);
  };
  const stopSelecting = () => { setSelecting(false); setChosen(new Set()); setConfirming(false); };
  const closePicked = () => {
    if (!confirming) { setConfirming(true); return; }
    const total = pickedNow.length;
    const r = store.closeDeadlines(pickedNow.map((d) => d.id), (closed, failed) => {
      toast(failed.length
        ? { text: `Закрыто ${closed} из ${closed + failed.length}. Не закрылись: ${failed.map((f) => `«${f.what}» — ${f.message}`).join('; ')}`, tone: 'error' }
        : { text: `Закрыто ${closed} ${plural(closed, 'срок', 'срока', 'сроков')} — следующие периоды система создала сама` });
    });
    if (r.skipped.length) {
      toast({ text: `Не отправлены (${r.skipped.length} из ${total}): ${r.skipped.map((s) => `«${s.what}» — ${s.message}`).join('; ')}`, tone: 'info', timeout: 12_000 });
    }
    play('tick');
    stopSelecting();
  };
  const overdue = count('overdue');
  // Печать «сроки на неделю» — мамин бумажный список: неделя, по дням, без меню и кнопок (styles/print.css).
  // Сначала показываем неделю без фильтров, потом печать — в следующем кадре, когда список перерисован.
  const printWeek = () => {
    setPicked(null); setRange('week'); setBy('day'); setKindF('all'); setStatusF('all'); setClientF('all');
    window.setTimeout(() => window.print(), 150);
  };

  return (
    <div ref={scope} className="page">
      <header className="page__head reveal">
        <div>
          <h1 className="page__title">Сроки <em>{overdue ? `${overdue} ${plural(overdue, 'просрочен', 'просрочены', 'просрочено')}` : 'без просрочек'}</em></h1>
          <p className="page__sub">Закрыть можно, когда отчётный период закончился, — система проверит сама и создаст следующий срок.</p>
        </div>
        <div className="page__actions">
          <button type="button" className="btn btn--secondary" onClick={printWeek}><Icon name="pdf" />Распечатать неделю</button>
          {store.createDeadline && <button type="button" className="btn btn--primary" onClick={() => ui.openNewDeadline()}><Icon name="plus" />Новый срок</button>}
        </div>
      </header>
      <p className="print-only print-head">Сроки на неделю · {fmtDayMonth(TODAY)} — {fmtDayMonth(addDays(TODAY, 7))} {TODAY.slice(0, 4)} · просрочено и горит</p>

      <div className="deadlines-grid">
        {/* Под календарём — нагрузка по неделям: левая колонка не стоит пустой рядом с длинным списком */}
        <aside className="panel panel--pad reveal"><Month picked={picked} onPick={setPicked} />{hasFeature('weekLoad') && <WeekLoadBar />}</aside>
        <section className="panel reveal" aria-labelledby="dl-title">
          <header className="panel__head">
            <h2 id="dl-title" className="panel__title">{picked ? fmtDayMonth(picked) : 'Открытые сроки'}<span className="sub num">{items.length}</span></h2>
            {picked
              ? <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPicked(null)}><Icon name="close" size={16} />Все дни</button>
              : <Tabs label="Период" value={range} onChange={(r) => { setRange(r); play('tick'); }} items={[
                { id: 'overdue', label: 'Просрочено', count: count('overdue') },
                { id: 'week', label: 'Неделя', count: count('week') },
                { id: 'month', label: '30 дней', count: count('month') },
                { id: 'all', label: 'Все', count: count('all') },
              ]} />}
          </header>
          <div className="dl-tools">
            {!selecting && (
              <button type="button" className="btn btn--secondary btn--sm dl-tools__select" onClick={startSelecting} {...roAttrs('deadlines')}>
                <Icon name="check" size={16} />Выбрать несколько
              </button>
            )}
            <div className="seg seg--fill dl-tools__by" role="group" aria-label="Как сгруппировать">
              {([['day', 'По дням'], ['kind', 'По виду'], ['client', 'По клиенту']] as const).map(([id, label]) => (
                <button key={id} type="button" className="seg__opt" aria-pressed={by === id} onClick={() => { setBy(id); play('tick'); }}>{label}</button>
              ))}
            </div>
            <div className="dfilters" role="group" aria-label="Фильтры сроков">
              <label><span className="sub">Статус</span>
                <select className="input input--sm" value={statusF} onChange={(e) => setStatusF(e.target.value as OpenStatus | 'all')}>
                  <option value="all">Все</option>
                  {OPEN_STATUSES.map((st) => <option key={st} value={st}>{STATUS_LABEL[st]}</option>)}
                </select></label>
              <label><span className="sub">Клиент</span>
                <select className="input input--sm" value={clientF} onChange={(e) => setClientF(e.target.value as ClientGroup | 'all')}>
                  <option value="all">Все</option>
                  {(Object.keys(CLIENT_GROUP_LABEL) as ClientGroup[]).map((g) => <option key={g} value={g}>{CLIENT_GROUP_LABEL[g]}</option>)}
                </select></label>
              {filtered && <button type="button" className="link" onClick={() => { setKindF('all'); setStatusF('all'); setClientF('all'); }}>Сбросить</button>}
            </div>
            {kinds.size > 1 && (
              <div className="chips dl-tools__kinds" role="group" aria-label="Вид отчёта">
                {[...kinds.entries()].sort((x, y) => y[1] - x[1]).map(([k, n]) => (
                  <button key={k} type="button" className="chip chip--icon" aria-pressed={kindF === k}
                    onClick={() => { setKindF(kindF === k ? 'all' : k); play('tick'); }}>
                    <Icon name={OBLIGATION_ICON[k]} size={16} />{OBLIGATION_LABEL[k]}<span className="chip__n num">{n}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {selecting && (
            <div className="dsel-bar" role="region" aria-label="Закрыть несколько сроков">
              <span><strong className="num">{pickedNow.length}</strong> {plural(pickedNow.length, 'срок выбран', 'срока выбрано', 'сроков выбрано')}</span>
              <button type="button" className="link" onClick={() => setChosen(new Set(items.map((d) => d.id)))}>Выбрать все в списке ({items.length})</button>
              {pickedNow.length > 0 && <button type="button" className="link" onClick={() => setChosen(new Set())}>Снять</button>}
              <span className="dsel-bar__grow" />
              {/* Как меню таблицы «Выделенное → В работе / Ожидание» (deadlines.updateMany) */}
              <button type="button" className="btn btn--secondary btn--sm" disabled={!pickedNow.length} {...roAttrs('deadlines')}
                onClick={() => { if (!canWrite('deadlines')) { toast({ text: roMessage('deadlines'), tone: 'info' }); return; } store.updateDeadlines(pickedNow.map((d) => d.id), { status: 'inProgress' }, 'В работе'); stopSelecting(); }}>В работе</button>
              <button type="button" className="btn btn--secondary btn--sm" disabled={!pickedNow.length} {...roAttrs('deadlines')}
                onClick={() => { if (!canWrite('deadlines')) { toast({ text: roMessage('deadlines'), tone: 'info' }); return; } store.updateDeadlines(pickedNow.map((d) => d.id), { status: 'waiting' }, 'Ожидание'); stopSelecting(); }}>Ожидание</button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={stopSelecting}>Отмена</button>
              <button type="button" className={`btn btn--sm ${confirming ? 'btn--danger' : 'btn--primary'}`} disabled={!pickedNow.length} onClick={closePicked}>
                {confirming ? `Да, закрыть ${pickedNow.length}` : `Закрыть ${pickedNow.length || ''}`.trim()}
              </button>
            </div>
          )}
          <SelectionCtx.Provider value={selection}>
          <DayGroups by={by} items={items} empty={
            filtered ? (
              <Empty pic="search" title="По этим фильтрам сроков нет" action={
                <button type="button" className="btn btn--secondary btn--sm" onClick={() => { setKindF('all'); setStatusF('all'); setClientF('all'); }}>Сбросить фильтры</button>
              }>Сроки есть — их скрыли фильтры «Вид», «Статус» или «Клиент».</Empty>
            ) : (
            <Empty pic="calm" title={picked ? 'В этот день сроков нет' : 'На этот период открытых сроков нет'}>
              {picked ? 'Выберите другой день в календаре.' : 'Всё сдано. Новые сроки система создаст сама.'}
            </Empty>
            )
          } />
          </SelectionCtx.Provider>
        </section>
      </div>

      {store.undated.length > 0 && (
        <section className="panel reveal" aria-labelledby="undated-title">
          <header className="panel__head"><h2 id="undated-title" className="panel__title">Без даты срока<span className="sub num">{store.undated.length}</span></h2></header>
          <p className="sub undated__hint">В таблице у этих сроков пустая дата — проверьте и впишите её там, на сайте они встанут на свой день сами.</p>
          <ul className="closed">
            {store.undated.map((d) => (
              <li key={d.id} className="closed__row">
                <Icon name="calendar" tile="wheat" />
                <span className="closed__text"><strong>{(() => { const c = store.client(d.clientId); return c ? shortName(c.name) : 'клиент не найден'; })()}</strong> — <TableText text={d.what} /></span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {store.closed.length > 0 && (
        <section id="closed" className="panel reveal closed-panel" aria-labelledby="closed-title" tabIndex={-1}>
          <header className="panel__head"><h2 id="closed-title" className="panel__title">Закрыто сегодня<span className="sub num">{store.closed.length}</span></h2></header>
          <ul className="closed">
            {store.closed.map(({ deadline, next, save, requestId }) => {
              const c = deadline.clientId ? store.client(deadline.clientId) : undefined;
              return (
                <li key={deadline.id} className="closed__row">
                  <span className="closed__check"><Icon name="check" size={16} /></span>
                  <span className="closed__text"><strong>{c ? shortName(c.name) : 'Клиент не указан'}</strong> — <TableText text={deadline.what} />
                    {next && <span className="sub">Система создала следующий: {next.what}, до {fmtDue(next.due)}</span>}</span>
                  <SaveBadge state={save} offline={!store.online} onRetry={() => store.retry(requestId)} />
                  {/* № 10: «Вернуть» — обычная кнопка сразу за текстом, а не серая в дальнем конце строки */}
                  <button type="button" className="btn btn--secondary btn--sm closed__undo" onClick={() => store.reopenDeadline(deadline.id)}><Icon name="undo" size={16} />Вернуть срок</button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
