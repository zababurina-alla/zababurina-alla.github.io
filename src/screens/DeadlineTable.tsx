// Таблица сроков — одна на «Сегодня», «Сроки» и карточку клиента.
// Строка: круглая галочка «Сдано и оплачено» слева (как дело в списке) → клиент → что сдать → когда.
// Срочность — значком «цвет + форма» из словаря (просрочено ●!, горит ●◷, скоро ○◷, в порядке ○✓) и словами.
import { useLayoutEffect, useRef } from 'react';
import { DeadlineActions, StatusTag } from './DeadlineActions';
import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import { useStore } from '../data/store';
import type { DatedDeadline, Status } from '../data/types';
import { TODAY, daysBetween, daysLabel, fmtDate, statusByDays } from '../lib/dates';
import { Icon } from '../ui/Icon';
import type { IconName } from '../ui/Icon';
import { Avatar, reducedMotion } from '../ui/kit';
import { shortName } from '../ui/names';
import { useUi } from '../app/ui-context';
import { roAttrs } from '../ui/readonly';
import { dismissHint } from '../ui/Hint';
import { TableText } from '../ui/TableText';
import { OBLIGATION_ICON } from '../ui/obligationIcon';
import { obligationKind } from '../lib/obligation';
import { useCloseDeadline } from './useClose';
import { useSelection } from './selection';

gsap.registerPlugin(Flip);

export const URGENCY_ICON: Record<Status, IconName> = { red: 'overdue', orange: 'burning', yellow: 'soon', green: 'ok', grey: 'inactive' };

/**
 * Список строк плавно перестраивается при любом изменении — закрыла мама, закрыл бот, пришло из таблицы:
 * оставшиеся строки переезжают на новые места (Flip, только transform, 400 мс), а не прыгают.
 */
function useFlipRows(scope: React.RefObject<HTMLElement | null>, key: string) {
  const prev = useRef<Flip.FlipState | null>(null);
  useLayoutEffect(() => {
    const rows = scope.current?.querySelectorAll('[data-row]');
    if (!rows) return;
    if (prev.current && !reducedMotion()) Flip.from(prev.current, { targets: rows, duration: 0.4, ease: 'power3.out' });
    prev.current = Flip.getState(rows);
  }, [key, scope]);
}

export function DeadlineTable({ items, showClient = true, empty = 'Сроков нет', foldFrom }: {
  items: DatedDeadline[]; showClient?: boolean; empty?: string;
  /** Строки с этого номера свёрнуты («Показать ещё N»): на экране скрыты, на бумаге печатаются все */
  foldFrom?: number | undefined;
}) {
  const store = useStore();
  const ui = useUi();
  const { close, closing, warn } = useCloseDeadline();
  const sel = useSelection();
  const scope = useRef<HTMLDivElement>(null);
  useFlipRows(scope, items.map((d) => d.id).join(','));
  if (items.length === 0) return <p className="empty">{empty}</p>;
  return (
    <div ref={scope} className={`dtable${showClient ? '' : ' dtable--noclient'}`} role="table" aria-label="Сроки">
      <div className="dtable__head" role="row">
        <span role="columnheader" className="c-act"><span className="visually-hidden">Сдано и оплачено</span></span>
        {showClient && <span role="columnheader" className="c-client">Клиент</span>}
        <span role="columnheader" className="c-what">Что сдать или оплатить</span>
        <span role="columnheader" className="c-due">Срок</span>
      </div>
      {items.map((d, i) => {
        const days = daysBetween(TODAY, d.due);
        const st = statusByDays(days);
        const c = d.clientId ? store.client(d.clientId) : undefined;
        const name = c ? shortName(c.name) : 'Клиент не указан';
        return (
          <div key={d.id} data-row data-id={d.id} data-flip-id={d.id} role="row" style={{ '--i': i } as React.CSSProperties}
            className={`dtable__row dtable__row--${st}${store.fresh.includes(d.id) ? ' is-fresh' : ''}${foldFrom !== undefined && i >= foldFrom ? ' is-folded' : ''}`}>
            <span role="cell" className="c-act">
              {sel.on ? (
                <input type="checkbox" className="dsel" checked={sel.picked.has(d.id)} onChange={() => sel.toggle(d.id)}
                  aria-label={`Выбрать: ${d.what}, ${name}`} />
              ) : (
              <button type="button" className="check-btn" aria-disabled={closing !== null}
                aria-label={`Сдано и оплачено: ${d.what}, ${name}`} title="Сдано и оплачено" onClick={() => { dismissHint('today.tick'); close(d.id); }}>
                <span className="check-btn__ring" aria-hidden="true"><Icon name="check" size={16} /></span>
              </button>
              )}
            </span>
            {showClient && (
              <span role="cell" className="dtable__client c-client">
                {c ? (
                  <button type="button" className="linklike" onClick={() => ui.openClient(c.id)}>
                    <Avatar name={c.name} clientId={c.id} />
                    <span className="dtable__name" data-client-name={c.id}>{name}</span>
                    <span className="dtable__fullname print-only">{c.name}</span>
                  </button>
                ) : <span className="nil">{name}</span>}
              </span>
            )}
            <span role="cell" className="dtable__what c-what">
              <span className="dtable__line"><TableText text={d.what} fallback={OBLIGATION_ICON[obligationKind(d.what)]} prefer="fallback" /> <StatusTag status={d.status} />
              <span className="dtable__tools">
                {/* Одно нажатие к нужному: позвонить клиенту, записать его платёж; «…» — статус и дата (техника сайта) */}
                {c?.phone && <a className="icon-btn dtable__tool" href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} aria-label={`Позвонить: ${name}`} title={`Позвонить ${c.phone}`}><Icon name="call" size={18} /><span className="dtable__tool-text" aria-hidden="true">Позвонить</span></a>}
                {c && <button type="button" className="icon-btn dtable__tool" aria-label={`Записать платёж: ${name}`} title="Записать платёж" onClick={() => ui.openPayment(c.id)} {...roAttrs('payments')}><Icon name="payments" size={18} /><span className="dtable__tool-text" aria-hidden="true">Платёж</span></button>}
                <DeadlineActions d={d} />
              </span></span>
              {warn[d.id] && <span className="inline-warn" role="status"><Icon name="clock" size={16} />{warn[d.id]}</span>}
            </span>
            <span role="cell" className="dtable__due c-due">
              <Icon name={URGENCY_ICON[st]} size={18} className={`urgency--${st}`} />
              <span className="dtable__when">
                <span className={`due--${st}`}>{daysLabel(days)}</span>
                <span className="sub num">{fmtDate(d.due)}</span>
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
