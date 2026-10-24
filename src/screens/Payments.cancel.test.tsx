// Приёмка-6, находка 2: у только что записанного платежа (save='saved', «в таблице») пропадала «Отменить».
// «Отменить» должна быть у любой строки, кроме той, что ещё пишется или не записалась; значок «в таблице» остаётся рядом.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Payment } from '../data/types';
import { TODAY } from '../lib/dates';

const pay = (id: string, save?: Payment['save']): Payment =>
  ({ id, version: 1, clientId: '', kopecks: 120000, period: 'Октябрь 2026', method: 'bank', date: TODAY, source: 'сайт', ...(save ? { save } : {}) });

let PAYS: Payment[] = [];
const removePayment = vi.fn();

vi.mock('../data/store', () => ({
  useStore: () => ({
    payments: PAYS, fresh: [], online: true, client: () => undefined, retry: () => undefined, pending: [], updatePayment: () => undefined,
    loadPaymentsMonth: async () => 0, removePayment,
  }),
}));

window.matchMedia ??= ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;

const { Payments } = await import('./Payments');

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });

let host: HTMLDivElement;
afterEach(() => { host.remove(); removePayment.mockClear(); });

function render() {
  host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => { root.render(<Payments />); });
  return host;
}
const row = (el: HTMLElement, id: string) => {
  const i = PAYS.findIndex((p) => p.id === id);
  return el.querySelectorAll<HTMLLIElement>('.paylist__row')[i];
};
const cancelOf = (li: HTMLElement | undefined) => li?.querySelector<HTMLButtonElement>('.paylist__cancel') ?? null;

describe('«Отменить» у платежа после ответа таблицы', () => {
  it('записанный сейчас («в таблице») — «Отменить» есть, значок остаётся, два нажатия отменяют', () => {
    PAYS = [pay('new', 'saved')];
    const el = render();
    const li = row(el, 'new');
    expect(li?.querySelector('.save--saved')?.textContent).toContain('в таблице');
    const btn = cancelOf(li);
    expect(btn?.textContent).toBe('Отменить');
    act(() => { btn?.click(); });
    expect(cancelOf(li)?.textContent).toBe('Да, отменить');
    expect(removePayment).not.toHaveBeenCalled();
    act(() => { cancelOf(li)?.click(); });
    expect(removePayment).toHaveBeenCalledWith('new');
  });

  it('старый платёж — как и раньше; пишется или не записался — «Отменить» нет', () => {
    PAYS = [pay('old'), pay('busy', 'saving'), pay('bad', 'failed')];
    const el = render();
    expect(cancelOf(row(el, 'old'))?.textContent).toBe('Отменить');
    expect(cancelOf(row(el, 'busy'))).toBeNull();
    expect(cancelOf(row(el, 'bad'))).toBeNull();
  });
});
