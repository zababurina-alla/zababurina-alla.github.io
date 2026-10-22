// «Сроки → Без даты срока» за флагом dueSet: без флага — только текст; с флагом — выбор даты и запись deadlines.update { due }
// (через store.updateDeadline); пока запись в очереди — «сохраняется…» вместо поля; только просмотр — поле недоступно.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Deadline } from '../data/types';

const D: Deadline = { id: 'd1', version: 7, clientId: 'c1', what: 'Декларація ЄП', due: null, status: 'new', periodicity: 'quarter' } as unknown as Deadline;

const flags = { dueSet: true, canWriteDeadlines: true };
const updateDeadline = vi.fn();
let pending: { op: { kind: string; id: string } }[] = [];

vi.mock('../config', async (orig) => ({
  ...(await orig<typeof import('../config')>()),
  hasFeature: (f: string) => (f === 'dueSet' ? flags.dueSet : true),
  canWrite: () => flags.canWriteDeadlines,
}));
vi.mock('../data/store', () => ({
  useStore: () => ({
    pending, online: true, updateDeadline,
    client: (id: string) => (id === 'c1' ? { id, name: 'Ромашко Іван Петрович' } : undefined),
  }),
}));

// jsdom без matchMedia, а модули интерфейса спрашивают его при загрузке.
window.matchMedia ??= ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;

const { UndatedRow } = await import('./UndatedRow');

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => { flags.dueSet = true; flags.canWriteDeadlines = true; pending = []; updateDeadline.mockClear(); });

let host: HTMLDivElement;
afterEach(() => { host.remove(); });

function render() {
  host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => { root.render(<ul><UndatedRow d={D} /></ul>); });
  return host;
}

function typeDate(el: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => { set?.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
}

describe('срок без даты', () => {
  it('без флага dueSet — только текст, поля даты нет', () => {
    flags.dueSet = false;
    const el = render();
    expect(el.textContent).toContain('Декларація ЄП');
    expect(el.querySelector('input')).toBeNull();
    expect(el.querySelector('button')).toBeNull();
  });

  it('с флагом: кнопка недоступна, пока дата не выбрана; потом — updateDeadline { due }', () => {
    const el = render();
    const input = el.querySelector('input') as HTMLInputElement;
    const btn = el.querySelector('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    typeDate(input, '2026-11-20');
    expect(btn.disabled).toBe(false);
    act(() => { btn.click(); });
    expect(updateDeadline).toHaveBeenCalledTimes(1);
    expect(updateDeadline.mock.calls[0]?.[0]).toBe('d1');
    expect(updateDeadline.mock.calls[0]?.[1]).toEqual({ due: '2026-11-20' });
    expect(String(updateDeadline.mock.calls[0]?.[2])).toContain('20.11');
  });

  it('запись в очереди — «сохраняется…», поля и кнопки нет (двойной записи не будет)', () => {
    pending = [{ op: { kind: 'updateDeadline', id: 'd1' } }];
    const el = render();
    expect(el.textContent).toContain('сохраняется');
    expect(el.querySelector('input')).toBeNull();
  });

  it('только просмотр (writes без deadlines) — поле и кнопка недоступны', () => {
    flags.canWriteDeadlines = false;
    const el = render();
    expect((el.querySelector('input') as HTMLInputElement).disabled).toBe(true);
    expect((el.querySelector('button') as HTMLButtonElement).disabled).toBe(true);
  });
});
