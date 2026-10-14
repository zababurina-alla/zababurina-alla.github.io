// «Платежи»: итог месяца крупно, столбики по дням, список по датам с источником и честным статусом записи.
// В суммы (месяц, день, столбики) идут только полученные деньги — как в monthStats; «ожидается», «не пришло»,
// «возвращено» видны в списке приглушённо и подписаны словами.
import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useStore } from '../data/store';
import { METHOD_LABEL, PAY_STATUS_LABEL, isReceived } from '../data/types';
import type { PayMethod } from '../data/types';
import { TODAY, addDays, daysInMonth, fmtDayMonth, monthName, plural, weekday } from '../lib/dates';
import { monthStats } from '../lib/monthStats';
import { formatMoney, formatPayMoney } from '../lib/money';
import { Icon } from '../ui/Icon';
import type { IconName } from '../ui/Icon';
import { Avatar, Money, RollingNumber, SaveBadge, reducedMotion } from '../ui/kit';
import { Empty } from '../ui/Empty';
import { shortName } from '../ui/names';
import { useUi } from '../app/ui-context';
import { roAttrs } from '../ui/readonly';

const SOURCE: Record<string, { icon: IconName; text: string }> = {
  'сайт': { icon: 'globe', text: 'с сайта' }, 'бот': { icon: 'bot', text: 'через бота' }, 'таблица': { icon: 'sheet', text: 'в таблице' },
};
// Способ оплаты — значок из словаря (Монобанк — это банк, 🏦), название — словом.
const METHOD_ICON: Record<PayMethod, IconName> = { bank: 'bank', cash: 'cash', mono: 'bank', diia: 'diia', transfer: 'transfer', other: 'other' };

function dayTitle(iso: string): string {
  if (iso === TODAY) return `Сегодня, ${fmtDayMonth(iso)}`;
  if (iso === addDays(TODAY, -1)) return `Вчера, ${fmtDayMonth(iso)}`;
  return `${weekday(iso).replace(/^./, (s) => s.toUpperCase())}, ${fmtDayMonth(iso)}`;
}

export function Payments() {
  const store = useStore();
  const ui = useUi();
  const scope = useRef<HTMLDivElement>(null);
  const stats = monthStats(store.payments, TODAY);
  const inMonth = store.payments.filter((p) => p.date.startsWith(stats.key));
  const today = Number(TODAY.slice(8, 10));
  const byDay = new Map<string, typeof inMonth>();
  for (const p of [...inMonth].sort((a, b) => b.date.localeCompare(a.date))) byDay.set(p.date, [...(byDay.get(p.date) ?? []), p]);
  const daySum = (xs: typeof inMonth) => xs.filter(isReceived).reduce((s, p) => s + (p.kopecks ?? 0), 0);
  const maxDay = Math.max(1, ...[...byDay.values()].map(daySum));
  const waiting = inMonth.filter((p) => !isReceived(p));

  useGSAP(() => {
    if (reducedMotion()) return;
    gsap.from('.reveal', { y: 14, opacity: 0, duration: 0.5, stagger: 0.05, ease: 'power3.out', clearProps: 'transform,opacity' });
    gsap.from('.bars__bar', { scaleY: 0, transformOrigin: '50% 100%', duration: 0.7, stagger: 0.018, ease: 'power3.out', delay: 0.15 });
  }, { scope });

  const growth = stats.growth;
  return (
    <div ref={scope} className="page">
      <header className="page__head reveal">
        <div><h1 className="page__title">Платежи <em>{monthName(stats.key, 'nom').toLowerCase()} {stats.key.slice(0, 4)}</em></h1></div>
        <button type="button" className="btn btn--primary" onClick={() => ui.openPayment()} {...roAttrs('payments')}><Icon name="plus" />Записать платёж</button>
      </header>

      <section className="hero pay-hero reveal" aria-label="Итог месяца">
        <div className="pay-hero__sum">
          <p className="eyebrow">Получено в {monthName(stats.key, 'prep')}</p>
          <p className="pay-hero__value display"><RollingNumber value={stats.total} format={(n) => formatMoney(n)} /></p>
          <p className="pay-hero__note">
            <span>{stats.count} {plural(stats.count, 'платёж', 'платежа', 'платежей')}</span>
            <span>в {monthName(stats.prevKey, 'prep')} — <Money text={formatMoney(stats.prevTotal)} /></span>
            {growth !== null && growth !== 0 && (
              <span className={growth > 0 ? 'up' : 'trend-down'}><Icon name={growth > 0 ? 'arrowUp' : 'arrowDown'} size={14} />{Math.abs(growth)}{' '}% к{' '}{monthName(stats.prevKey, 'dat')}</span>
            )}
          </p>
          {waiting.length > 0 && (
            <p className="pay-hero__wait"><Icon name="waiting" size={16} />Ещё {waiting.length} {plural(waiting.length, 'платёж', 'платежа', 'платежей')} не в кассе: <Money text={formatMoney(waiting.reduce((s, p) => s + (p.kopecks ?? 0), 0))} /> — в итог не входят</p>
          )}
        </div>
        <div className="bars" role="img" aria-label={`Поступления по дням ${monthName(stats.key, 'gen')}: всего ${formatMoney(stats.total)}, самый большой день — ${formatMoney(maxDay)}`}>
          {Array.from({ length: daysInMonth(stats.key) }, (_, i) => {
            const iso = `${stats.key}-${String(i + 1).padStart(2, '0')}`;
            const sum = daySum(byDay.get(iso) ?? []);
            return <span key={iso} className={`bars__bar${sum ? '' : ' is-empty'}${i + 1 > today ? ' is-future' : ''}${i + 1 === today ? ' is-today' : ''}`}
              style={{ height: `${sum ? Math.max(8, (sum / maxDay) * 100) : 4}%` }} title={sum ? `${fmtDayMonth(iso)}: ${formatMoney(sum)}` : undefined} />;
          })}
          <span className="bars__axis" aria-hidden="true"><span>1</span><span>{Math.ceil(daysInMonth(stats.key) / 2)}</span><span>{daysInMonth(stats.key)}</span></span>
        </div>
      </section>

      <section className="panel reveal" aria-label="Платежи по дням">
        {byDay.size === 0 && (
          <Empty pic="wallet" title={`В ${monthName(stats.key, 'prep')} платежей пока нет`} action={
            <button type="button" className="btn btn--primary" onClick={() => ui.openPayment()} {...roAttrs('payments')}><Icon name="plus" />Записать платёж</button>
          }>Записанные с сайта, через бота и в таблице появятся здесь.</Empty>
        )}
        {[...byDay.entries()].map(([day, list]) => (
          <div key={day} className="dgroup">
            <h2 className="dgroup__title"><span>{dayTitle(day)}</span>
              <span className="dgroup__count"><Money text={formatMoney(daySum(list))} /></span></h2>
            <ul className="paylist">
              {list.map((p, i) => {
                const c = p.clientId ? store.client(p.clientId) : undefined;
                const src = SOURCE[p.source] ?? { icon: 'sync' as const, text: '' };
                const got = isReceived(p);
                return (
                  <li key={p.id} style={{ '--i': i } as React.CSSProperties}
                    className={`paylist__row${p.save === 'saving' ? ' is-saving' : ''}${got ? '' : ' is-pending'}${store.fresh.includes(p.id) ? ' is-fresh' : ''}`}>
                    {c ? (
                      <button type="button" className="linklike paylist__who" onClick={() => ui.openClient(c.id)}>
                        <Avatar name={c.name} /><span><strong>{shortName(c.name)}</strong><span className="sub">{p.period || <span className="nil">период не указан</span>}</span></span>
                      </button>
                    ) : <span className="paylist__who"><span><strong className="nil">Клиент не указан</strong><span className="sub">{p.period}</span></span></span>}
                    <span className="paylist__how sub"><Icon name={METHOD_ICON[p.method]} size={16} />{METHOD_LABEL[p.method]}<span className="paylist__src" title={`Записано ${src.text}`}><Icon name={src.icon} size={14} />{src.text}</span></span>
                    {p.save ? <SaveBadge state={p.save} offline={!store.online} onRetry={() => store.retry(p.id)} />
                      : !got && p.status ? <span className="pill pill--grey">{PAY_STATUS_LABEL[p.status]}</span> : <span />}
                    <span className="paylist__sum display"><Money text={formatPayMoney(p.kopecks)} /></span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
