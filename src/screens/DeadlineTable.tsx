// Таблица сроков — одна на «Сегодня», «Сроки» и карточку клиента.
import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import { useStore } from '../data/store';
import type { Deadline } from '../data/types';
import { TODAY, daysBetween, daysLabel, fmtDate, statusByDays } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { Icon } from '../ui/Icon';
import { Avatar, StatusPill, reducedMotion } from '../ui/kit';
import { useUi } from '../app/ui-context';
import { useCloseDeadline } from './useClose';

gsap.registerPlugin(Flip);

/**
 * Список строк плавно перестраивается при любом изменении — закрыла мама, закрыл бот, пришло из таблицы:
 * оставшиеся строки переезжают на новые места (Flip, только transform, 320 мс), а не прыгают.
 */
function useFlipRows(scope: React.RefObject<HTMLElement | null>, key: string) {
  const prev = useRef<Flip.FlipState | null>(null);
  useLayoutEffect(() => {
    const rows = scope.current?.querySelectorAll('[data-row]');
    if (!rows) return;
    if (prev.current && !reducedMotion()) Flip.from(prev.current, { targets: rows, duration: 0.32, ease: 'power2.inOut' });
    prev.current = Flip.getState(rows);
  }, [key, scope]);
}

export function DeadlineTable({ items, showClient = true, empty = 'Сроков нет' }: {
  items: Deadline[]; showClient?: boolean; empty?: string;
}) {
  const store = useStore();
  const ui = useUi();
  const { close, closing, warn } = useCloseDeadline();
  const scope = useRef<HTMLDivElement>(null);
  useFlipRows(scope, items.map((d) => d.id).join(','));
  if (items.length === 0) return <p className="empty">{empty}</p>;
  return (
    <div ref={scope} className={`dtable${showClient ? '' : ' dtable--noclient'}`} role="table" aria-label="Сроки">
      <div className="dtable__head" role="row">
        {showClient && <span role="columnheader" className="c-client">Клиент</span>}
        <span role="columnheader" className="c-what">Что сдать или оплатить</span>
        <span role="columnheader" className="c-due">Срок</span>
        <span role="columnheader" className="ta-r c-sum">Сумма</span>
        <span role="columnheader" className="c-status">Статус</span>
        <span role="columnheader" className="c-act"><span className="visually-hidden">Закрыть</span></span>
      </div>
      {items.map((d) => {
        const days = daysBetween(TODAY, d.due);
        const st = statusByDays(days);
        const c = store.client(d.clientId);
        return (
          <div key={d.id} data-row data-id={d.id} data-flip-id={d.id} className={`dtable__row${store.fresh.includes(d.id) ? ' is-fresh' : ''}`} role="row">
            {showClient && (
              <span role="cell" className="dtable__client c-client">
                <button type="button" className="linklike" onClick={() => ui.openClient(d.clientId)}>
                  <Avatar name={c?.name ?? '?'} clientId={d.clientId} />
                  <span className="dtable__name" data-client-name={d.clientId}>{c?.name.split(' ').slice(0, 2).join(' ')}</span>
                </button>
              </span>
            )}
            <span role="cell" className="dtable__what c-what">
              {d.what}
              {warn[d.id] && <span className="inline-warn" role="status"><Icon name="clock" size={16} />{warn[d.id]}</span>}
            </span>
            <span role="cell" className="dtable__due c-due"><span className="num">{fmtDate(d.due)}</span><span className={`sub due--${st}`}>{daysLabel(days)}</span></span>
            <span role="cell" className="ta-r num dtable__sum c-sum">{d.kopecks ? formatMoney(d.kopecks) : <span className="sub">—</span>}</span>
            <span role="cell" className="c-status"><StatusPill status={st} /></span>
            <span role="cell" className="ta-r c-act">
              <button type="button" className="check-btn" aria-disabled={closing !== null}
                aria-label={`Сдано и оплачено: ${d.what}, ${c?.name ?? ''}`} title="Сдано и оплачено" onClick={() => close(d.id)}>
                <Icon name="check" />
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}
