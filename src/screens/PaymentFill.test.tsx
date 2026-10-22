// «Платежи → Без даты или суммы» за флагом paymentsFill: без флага — как было (поля нет); с флагом — поле только для
// недостающего, запись payments.update { date?, amountKopecks? } через store.updatePayment; в очереди — «сохраняется…»;
// только просмотр — поля недоступны; дата позже завтра и неверная сумма не уходят.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Payment } from '../data/types';
import { TODAY, addDays } from '../lib/dates';

const pay = (id: string, date: string | null, kopecks: number | null): Payment =>
  ({ id, version: 4, clientId: '', kopecks, period: 'Октябрь 2026', method: 'bank', date, source: 'таблица' });

const flags = { paymentsFill: true, canWritePayments: true };
const updatePayment = vi.fn();
const retry = vi.fn();
let payments: Payment[] = [];
let pending: { state: string; op: { kind: string; id: string; requestId: string } }[] = [];

vi.mock('../config', async (orig) => ({
  ...(await orig<typeof import('../config')>()),
  hasFeature: (f: string) => (f === 'paymentsFill' ? flags.paymentsFill : true),
  canWrite: () => flags.canWritePayments,
}));
vi.mock('../data/store', () => ({
  useStore: () => ({
    get payments() { return payments; }, fresh: [], online: true, client: () => undefined, retry, updatePayment, pending,
    loadPaymentsMonth: async () => 0,
  }),
}));

// jsdom без matchMedia, а модули интерфейса спрашивают его при загрузке.
window.matchMedia ??= ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;

const { Payments } = await import('./Payments');

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  flags.paymentsFill = true; flags.canWritePayments = true; pending = []; updatePayment.mockClear(); retry.mockClear();
  payments = [pay('p-nodate', null, 50000), pay('p-nosum', TODAY, null), pay('p-none', null, null)];
});

let host: HTMLDivElement;
afterEach(() => { host.remove(); });

function render() {
  host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => { root.render(<Payments />); });
  return host;
}

const rows = (el: HTMLElement) => [...el.querySelectorAll('.paylist__row')] as HTMLElement[];

function typeInto(el: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => { set?.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
}
const click = (b: HTMLElement) => act(() => { b.click(); });

describe('платёж без даты или суммы: дописать', () => {
  it('без флага paymentsFill — полей нет, как было', () => {
    flags.paymentsFill = false;
    const el = render();
    expect(rows(el)).toHaveLength(3);
    expect(el.querySelector('.paylist__fill')).toBeNull();
  });

  it('заголовок группы: с флагом и записью — «допишите здесь»; без флага или без записи — «проверьте в таблице»', () => {
    let el = render();
    expect(el.querySelector('.dgroup__title')?.textContent).toContain('Без даты или суммы — допишите здесь');
    el.remove();
    flags.paymentsFill = false;
    el = render();
    expect(el.querySelector('.dgroup__title')?.textContent).toContain('Без даты или суммы — проверьте в таблице');
    el.remove();
    flags.paymentsFill = true; flags.canWritePayments = false;
    el = render();
    expect(el.querySelector('.dgroup__title')?.textContent).toContain('Без даты или суммы — проверьте в таблице');
  });

  it('с флагом: у «без даты» — только дата, у «без суммы» — только сумма, у «без обоих» — оба поля', () => {
    const el = render();
    const [noDate, noSum, none] = rows(el);
    expect(noDate?.querySelectorAll('input[type=date]')).toHaveLength(1);
    expect(noDate?.querySelectorAll('input[type=text]')).toHaveLength(0);
    expect(noSum?.querySelectorAll('input[type=date]')).toHaveLength(0);
    expect(noSum?.querySelectorAll('input[type=text]')).toHaveLength(1);
    expect(none?.querySelectorAll('input')).toHaveLength(2);
  });

  it('дата: кнопка недоступна, пока не выбрана; потом updatePayment { date } с id платежа', () => {
    const el = render();
    const row = rows(el)[0] as HTMLElement;
    const btn = row.querySelector('button[type=submit]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    typeInto(row.querySelector('input[type=date]') as HTMLInputElement, '2026-10-10');
    expect(btn.disabled).toBe(false);
    click(btn);
    expect(updatePayment).toHaveBeenCalledTimes(1);
    expect(updatePayment.mock.calls[0]?.[0]).toBe('p-nodate');
    expect(updatePayment.mock.calls[0]?.[1]).toEqual({ date: '2026-10-10' });
  });

  it('сумма «1 234,50» → amountKopecks 123450 (целое), поля даты в патче нет', () => {
    const el = render();
    const row = rows(el)[1] as HTMLElement;
    typeInto(row.querySelector('input[type=text]') as HTMLInputElement, '1 234,50');
    click(row.querySelector('button[type=submit]') as HTMLElement);
    expect(updatePayment.mock.calls[0]?.[0]).toBe('p-nosum');
    expect(updatePayment.mock.calls[0]?.[1]).toEqual({ amountKopecks: 123450 });
  });

  it('оба пустых: можно дописать только одно поле; оба — в одном патче', () => {
    const el = render();
    const row = rows(el)[2] as HTMLElement;
    const [d, s] = [...row.querySelectorAll('input')] as HTMLInputElement[];
    typeInto(s as HTMLInputElement, '700');
    click(row.querySelector('button[type=submit]') as HTMLElement);
    expect(updatePayment.mock.calls[0]?.[1]).toEqual({ amountKopecks: 70000 });
    typeInto(d as HTMLInputElement, '2026-10-12');
    click(row.querySelector('button[type=submit]') as HTMLElement);
    expect(updatePayment.mock.calls[1]?.[1]).toEqual({ date: '2026-10-12', amountKopecks: 70000 });
  });

  it('дата позже завтра и сумма «0» / «abc» не уходят, ошибка словами', () => {
    const el = render();
    const none = rows(el)[2] as HTMLElement;
    const [d, s] = [...none.querySelectorAll('input')] as HTMLInputElement[];
    const btn = none.querySelector('button[type=submit]') as HTMLButtonElement;
    typeInto(d as HTMLInputElement, addDays(TODAY, 2));
    expect(btn.disabled).toBe(true);
    expect(none.textContent).toContain('Дата оплаты ещё не наступила');
    typeInto(d as HTMLInputElement, addDays(TODAY, 1));
    expect(btn.disabled).toBe(false);
    typeInto(s as HTMLInputElement, '0');
    expect(btn.disabled).toBe(true);
    expect(none.textContent).toContain('Сумма должна быть больше нуля');
    typeInto(s as HTMLInputElement, 'abc');
    expect(btn.disabled).toBe(true);
    click(btn);
    expect(updatePayment).not.toHaveBeenCalled();
  });

  it('запись в очереди — «сохраняется…», поле скрыто; не ушла — «не сохранилось — повторить» с повтором по requestId', () => {
    pending = [{ state: 'sending', op: { kind: 'updatePayment', id: 'p-nodate', requestId: 'r1' } }];
    let el = render();
    const row = rows(el)[0] as HTMLElement;
    expect(row.textContent).toContain('сохраняется');
    expect(row.querySelector('input')).toBeNull();
    el.remove();
    pending = [{ state: 'failed', op: { kind: 'updatePayment', id: 'p-nodate', requestId: 'r1' } }];
    el = render();
    const again = (rows(el)[0] as HTMLElement).querySelector('.save--failed') as HTMLElement;
    expect(again.textContent).toContain('повторить');
    click(again);
    expect(retry).toHaveBeenCalledWith('r1');
  });

  it('только просмотр (writes без payments) — поля и кнопка недоступны', () => {
    flags.canWritePayments = false;
    const el = render();
    const row = rows(el)[0] as HTMLElement;
    expect((row.querySelector('input') as HTMLInputElement).disabled).toBe(true);
    expect((row.querySelector('button[type=submit]') as HTMLButtonElement).disabled).toBe(true);
  });
});
