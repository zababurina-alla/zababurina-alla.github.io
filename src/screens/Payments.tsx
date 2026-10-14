// «Платежи»: итог месяца крупно, график по дням, список по датам с источником и честным статусом записи.
import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { SEPTEMBER_TOTAL } from '../data/fake';
import { useStore } from '../data/store';
import { fmtDate, fmtDayMonth, plural, weekday } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { Icon } from '../ui/Icon';
import type { IconName } from '../ui/Icon';
import { Avatar, RollingNumber, SaveBadge, reducedMotion } from '../ui/kit';
import { useUi } from '../app/ui-context';

const SOURCE: Record<string, { icon: IconName; text: string }> = {
  'сайт': { icon: 'globe', text: 'с сайта' }, 'бот': { icon: 'bot', text: 'через бота' }, 'таблица': { icon: 'sheet', text: 'в таблице' },
};

export function Payments() {
  const store = useStore();
  const ui = useUi();
  const scope = useRef<HTMLDivElement>(null);
  const october = store.payments.filter((p) => p.date.startsWith('2026-10'));
  const total = october.reduce((s, p) => s + p.kopecks, 0);
  const byDay = new Map<string, typeof october>();
  for (const p of [...october].sort((a, b) => b.date.localeCompare(a.date))) byDay.set(p.date, [...(byDay.get(p.date) ?? []), p]);
  const maxDay = Math.max(1, ...[...byDay.values()].map((xs) => xs.reduce((s, p) => s + p.kopecks, 0)));

  useGSAP(() => {
    if (reducedMotion()) return;
    gsap.from('.reveal', { y: 14, opacity: 0, duration: 0.45, stagger: 0.05, ease: 'power3.out', clearProps: 'transform,opacity' });
    gsap.from('.bars__bar', { scaleY: 0, transformOrigin: '50% 100%', duration: 0.6, stagger: 0.02, ease: 'power3.out', delay: 0.15 });
  }, { scope });

  return (
    <div ref={scope} className="page">
      <header className="page__head reveal">
        <div><h1 className="page__title">Платежи</h1><p className="page__sub">Октябрь 2026</p></div>
        <button type="button" className="btn btn--primary" onClick={() => ui.openPayment()}><Icon name="plus" />Записать платёж</button>
      </header>

      <section className="panel panel--pad pay-summary reveal" aria-label="Итог месяца">
        <div>
          <p className="kpi__label">Получено в октябре</p>
          <p className="kpi__value kpi__value--xl"><RollingNumber value={total} format={(n) => formatMoney(n)} /></p>
          <p className="kpi__note">{october.length} {plural(october.length, 'платёж', 'платежа', 'платежей')}, в сентябре {formatMoney(SEPTEMBER_TOTAL * 100)}</p>
        </div>
        <div className="bars" role="img" aria-label={`Поступления по дням октября: всего ${formatMoney(total)}, самый большой день — ${formatMoney(maxDay)}`}>
          {Array.from({ length: 31 }, (_, i) => {
            const iso = `2026-10-${String(i + 1).padStart(2, '0')}`;
            const sum = (byDay.get(iso) ?? []).reduce((s, p) => s + p.kopecks, 0);
            return <span key={iso} className={`bars__bar${sum ? '' : ' is-empty'}${i + 1 > 14 ? ' is-future' : ''}`}
              style={{ height: `${sum ? Math.max(8, (sum / maxDay) * 100) : 4}%` }} title={sum ? `${i + 1} окт: ${formatMoney(sum)}` : undefined} />;
          })}
        </div>
      </section>

      <section className="panel reveal" aria-label="Платежи по дням">
        {[...byDay.entries()].map(([day, list]) => (
          <div key={day} className="dgroup">
            <h2 className="dgroup__title">{weekday(day).replace(/^./, (s) => s.toUpperCase())}, {fmtDayMonth(day)}
              <span className="sub num">{formatMoney(list.reduce((s, p) => s + p.kopecks, 0))}</span></h2>
            <ul className="paylist">
              {list.map((p) => {
                const c = store.client(p.clientId);
                const src = SOURCE[p.source] ?? { icon: 'sync' as const, text: '' };
                return (
                  <li key={p.id} className={`paylist__row${p.save === 'saving' ? ' is-saving' : ''}${store.fresh.includes(p.id) ? ' is-fresh' : ''}`}>
                    <button type="button" className="linklike paylist__who" onClick={() => ui.openClient(p.clientId)}>
                      <Avatar name={c?.name ?? '?'} /><span><strong>{c?.name.split(' ').slice(0, 2).join(' ')}</strong><span className="sub">{p.period}, {p.method}</span></span>
                    </button>
                    <span className="paylist__src sub"><Icon name={src.icon} size={16} />{src.text}</span>
                    {p.save ? <SaveBadge state={p.save} offline={!store.online} onRetry={() => store.retry(p.id)} /> : <span className="sub num">{fmtDate(p.date)}</span>}
                    <span className="paylist__sum num">{formatMoney(p.kopecks)}</span>
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
