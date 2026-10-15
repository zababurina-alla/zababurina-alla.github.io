// «Справочник»: цифры только из ответа сервера; запасные цифры подписаны «не из таблицы», пределы из кода — мелко.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { KvedItem, Rates } from '../data/types';

const RATES: Rates = {
  year: 2026, mzpKopecks: 864700, pmKopecks: null, esvMonthlyKopecks: 190234, esvRatePct: 22,
  groups: [{ group: 2, limitKopecks: 721159800, limitMzp: 834, epRule: '20 % МЗП' }],
  updatedAt: '2026-01-02', source: 'fallback', limitsSource: 'code',
};
const KV: KvedItem[] = [{ code: '56.30', title: 'Обслуговування напоями', epByGroup: { '2': '20 % МЗП' }, councilDecision: null }];
const kved = vi.fn(async () => KV);

vi.mock('../data/session', () => ({ api: { referenceRates: async () => RATES, referenceKved: kved } }));
vi.mock('../data/store', () => ({ useStore: () => ({}) }));

// jsdom без matchMedia, а модули интерфейса спрашивают его при загрузке.
window.matchMedia ??= ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;

const { Reference } = await import('./Other');

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });

describe('«Справочник» с сервера', () => {
  it('ставки из ответа, пустая клетка — «—», подписи источника; КВЕД ищется на сервере', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    await act(async () => { createRoot(host).render(<Reference />); });
    const text = host.textContent ?? '';
    expect(text).toContain('ставки 2026');
    expect(text).toMatch(/8\s647/);
    expect(text).toContain('Не из таблицы');
    expect(text).toContain('Пределы групп — по закону 2026');
    expect(text).toContain('ЄП 2 группа');
    expect(host.querySelectorAll('.rate')[1]?.textContent).toContain('—');
    const input = host.querySelector<HTMLInputElement>('input[type="search"]');
    expect(input).not.toBeNull();
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      set?.call(input, '56.3');
      input?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
    expect(kved).toHaveBeenCalledWith('56.3');
    expect(host.textContent).toContain('2 гр. — 20 % МЗП');
    host.remove();
  });
});
