// Живые данные 15.10: платёж с пустой датой в листе ронял «Платежи» и весь сайт. Экран рисуется, такой платёж —
// в группе «Без даты или суммы», в итог не идёт; упавший экран не гасит остальное (ScreenBoundary).
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Payment } from '../data/types';
import { TODAY } from '../lib/dates';

const pay = (id: string, date: string | null, kopecks: number | null): Payment =>
  ({ id, version: 1, clientId: '', kopecks, period: 'Октябрь 2026', method: 'bank', date, source: 'таблица' });

const PAYS: Payment[] = [pay('p1', TODAY, 120000), pay('p2', null, 50000), pay('p3', TODAY, null), pay('p4', null, null)];

vi.mock('../data/store', () => ({
  useStore: () => ({
    payments: PAYS, fresh: [], online: true, client: () => undefined, retry: () => undefined, pending: [], updatePayment: () => undefined,
    loadPaymentsMonth: async () => 0,
  }),
}));

// jsdom без matchMedia, а модули интерфейса спрашивают его при загрузке.
window.matchMedia ??= ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;

const { Payments } = await import('./Payments');
const { ScreenBoundary } = await import('../app/ScreenBoundary');

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let host: HTMLDivElement;
afterEach(() => { host.remove(); });

function render(node: React.ReactNode) {
  host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => { root.render(node); });
  return host;
}

describe('«Платежи» с пустой датой и суммой', () => {
  it('экран рисуется; без даты и без суммы — отдельной группой; в итоге только 1 200 ₴', () => {
    const el = render(<Payments />);
    const groups = [...el.querySelectorAll('.dgroup')];
    const check = groups.find((g) => g.textContent?.includes('Без даты или суммы'));
    expect(check?.querySelectorAll('.paylist__row')).toHaveLength(3);
    const days = groups.filter((g) => g !== check);
    expect(days).toHaveLength(1);
    expect(days[0]?.querySelectorAll('.paylist__row')).toHaveLength(1);
    expect(el.querySelector('.pay-hero__note')?.textContent).toContain('1 платёж');
  });
});

describe('предохранитель экрана', () => {
  it('упавший экран — объяснение и «Обновить», сосед живёт', () => {
    const Boom = () => { throw new Error('null.startsWith'); };
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const el = render(<><ScreenBoundary><Boom /></ScreenBoundary><p id="menu">меню</p></>);
    err.mockRestore();
    expect(el.textContent).toContain('Не получилось показать экран');
    expect(el.querySelector('button')?.textContent).toBe('Обновить');
    expect(el.querySelector('#menu')).not.toBeNull();
  });
});
