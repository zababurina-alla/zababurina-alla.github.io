// «🗓 Месяц» (month.get / month.set, v5.90): чек-лист по клиентам со штатом за текущий месяц — 7 галочек, как в листе.
// Галочка — сразу на экране, ответ таблицы (свежий процент) заменяет строку; не записалось — галочка возвращается.
// Оформление — за отделом дизайна.
import { useEffect, useState } from 'react';
import { useStore } from '../data/store';
import { MONTH_CHECKS } from '../data/api';
import type { MonthCheck, MonthItem } from '../data/api';
import { Icon } from '../ui/Icon';
import { Empty } from '../ui/Empty';
import { useToast } from '../ui/toast';
import { useUi } from '../app/ui-context';

export const MONTH_LABEL: Record<MonthCheck, string> = {
  advance: 'Аванс', advanceTax: 'Налоги с аванса', salary: 'Зарплата', salaryTax: 'Налоги с зарплаты',
  timesheet: 'Табель', payroll: 'Ведомость', report: 'Отчёт / квитанции',
};

// Месяц в шапке — по-русски: лист отдаёт «жовтень 2026» (приёмка 16.10, Г-1); незнакомое слово оставляем как есть
const UK_MONTH: Record<string, string> = {
  січень: 'январь', лютий: 'февраль', березень: 'март', квітень: 'апрель', травень: 'май', червень: 'июнь',
  липень: 'июль', серпень: 'август', вересень: 'сентябрь', жовтень: 'октябрь', листопад: 'ноябрь', грудень: 'декабрь',
};
const ruPeriod = (p: string) => p.replace(/\p{L}+/gu, (w) => UK_MONTH[w.toLowerCase()] ?? w);

// Заголовки колонок — коротко, в одну строку (девять колонок на ноутбуке); полное название — в подсказке
const MONTH_SHORT: Record<MonthCheck, string> = {
  advance: 'Аванс', advanceTax: 'Налог ав.', salary: 'Зарплата', salaryTax: 'Налог ЗП',
  timesheet: 'Табель', payroll: 'Ведомость', report: 'Отчёт',
};

export function Month() {
  const { month } = useStore();
  const ui = useUi();
  const toast = useToast();
  const [sheet, setSheet] = useState<{ period: string | null; items: MonthItem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!month) return;
    let alive = true;
    month.get().then((s) => { if (alive) setSheet(s); }, (e: unknown) => { if (alive) setError(e instanceof Error && e.name === 'ApiError' ? e.message : 'Таблица не ответила'); });
    return () => { alive = false; };
  }, [month]);

  if (!month) return <div className="page"><Empty pic="calm" title="Месяц пока в таблице">Лист «Месяц» появится здесь, когда его откроет сервер.</Empty></div>;

  async function toggle(it: MonthItem, k: MonthCheck) {
    if (!month || !it.clientId) return;
    if (!month.set) { toast({ text: 'Галочки «Месяца» пока ставьте в таблице — на сайте появится само', tone: 'info' }); return; }
    const key = `${it.clientId}|${k}`;
    const done = !it.checks[k];
    const put = (fn: (m: MonthItem) => MonthItem) => setSheet((s) => (s ? { ...s, items: s.items.map((m) => (m.clientId === it.clientId ? fn(m) : m)) } : s));
    put((m) => ({ ...m, checks: { ...m.checks, [k]: done } }));
    setSaving((s) => new Set(s).add(key));
    try {
      const fresh = await month.set(it.clientId, k, done);
      put(() => fresh);
    } catch (e) {
      put((m) => ({ ...m, checks: { ...m.checks, [k]: !done } }));
      toast({ text: `Не записалось: ${MONTH_LABEL[k]} — ${e instanceof Error && e.name === 'ApiError' ? e.message : 'таблица не ответила'}`, tone: 'error' });
    } finally {
      setSaving((s) => { const n = new Set(s); n.delete(key); return n; });
    }
  }

  return (
    <div className="page">
      <header className="page__head"><div>
        <h1 className="page__title">Месяц <em>{sheet?.period ? ruPeriod(sheet.period) : ''}</em></h1>
        <p className="page__sub">Чек-лист по клиентам со штатом — как лист «Месяц» в таблице. Отметьте сделанное.</p>
      </div></header>
      {error && <p className="offline" role="alert"><Icon name="warning" /><span>Месяц не загрузился: {error}</span></p>}
      {!sheet && !error && <p className="sub" role="status">Загружаем лист «Месяц»…</p>}
      {sheet && (sheet.items.length ? (
        <section className="panel mcheck" aria-label="Чек-лист месяца">
          <div className="mcheck__table" role="table" aria-label="Клиенты со штатом">
            <div className="mcheck__head" role="row">
              <span role="columnheader">Клиент</span>
              {MONTH_CHECKS.map((k) => <span key={k} role="columnheader" title={MONTH_LABEL[k]} aria-label={MONTH_LABEL[k]}>{MONTH_SHORT[k]}</span>)}
              <span role="columnheader" className="ta-r">Готово</span>
            </div>
            {sheet.items.map((it, i) => (
              <div key={it.clientId ?? `n-${i}`} className="mcheck__row" role="row">
                <span role="cell" className="mcheck__who">
                  {it.clientId ? <button type="button" className="linklike" onClick={() => ui.openClient(it.clientId ?? '')}>{it.name}</button> : <span>{it.name} <span className="sub">— нет в «Клиентах»</span></span>}
                  {(it.status || it.comment) && <span className="sub">{[it.status, it.comment].filter(Boolean).join(' · ')}</span>}
                </span>
                {MONTH_CHECKS.map((k) => (
                  // Ячейка — подпись: на узком экране галочка с названием («Аванс»), нажимается вместе с текстом
                  <label key={k} role="cell" data-label={MONTH_SHORT[k]}>
                    <input type="checkbox" className="mcheck__box" checked={it.checks[k]} disabled={!it.clientId || saving.has(`${it.clientId}|${k}`)}
                      aria-label={`${MONTH_LABEL[k]}: ${it.name}`} onChange={() => { void toggle(it, k); }} />
                  </label>
                ))}
                <span role="cell" className="ta-r num">{it.percent} %</span>
              </div>
            ))}
          </div>
        </section>
      ) : <Empty pic="calm" title="В листе «Месяц» пусто">Клиенты со штатом появятся, когда таблица пересоберёт лист.</Empty>)}
    </div>
  );
}
