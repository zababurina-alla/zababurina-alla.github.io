// «Задачи»: сделанных в снимке бывают сотни, на экране 20 последних. Без флага tasksShowAll — «Ещё N сделанных — в таблице»;
// с флагом — кнопка «Показать все» раскрывает весь список из снимка и ничего не пишет на сервер.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../data/types';

const task = (i: number, done: boolean): Task =>
  ({ id: `t${i}`, version: 1, clientId: null, text: `Задача ${i}`, due: null, priority: 'medium', type: 'docs', done });
const TASKS: Task[] = [task(0, false), ...Array.from({ length: 25 }, (_, i) => task(i + 1, true))];

const flags = { tasksShowAll: true };
const writes = vi.fn();

vi.mock('../config', async (orig) => ({
  ...(await orig<typeof import('../config')>()),
  hasFeature: (f: string) => (f === 'tasksShowAll' ? flags.tasksShowAll : true),
  canWrite: () => true,
}));
vi.mock('../data/store', () => ({
  useStore: () => ({
    tasks: TASKS, clients: [], pending: [], fresh: [], online: true, client: () => undefined,
    addTask: writes, toggleTask: writes, completeTasks: writes, updateTask: writes, deleteTask: writes,
  }),
}));

// jsdom без matchMedia, а модули интерфейса спрашивают его при загрузке.
window.matchMedia ??= ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;

const { Tasks } = await import('./Other');

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => { flags.tasksShowAll = true; writes.mockClear(); });

let host: HTMLDivElement;
afterEach(() => { host.remove(); });

function render() {
  host = document.createElement('div');
  document.body.append(host);
  act(() => { createRoot(host).render(<Tasks />); });
  const open = [...host.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Показать сделанные'));
  act(() => { open?.click(); });
  return host;
}

const doneRows = (el: HTMLElement) => el.querySelectorAll('.tasks__row.is-done').length;
const btn = (el: HTMLElement, start: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.startsWith(start));

describe('«Задачи»: сделанные', () => {
  it('без флага — 20 последних и подпись «Ещё 5 сделанных — в таблице», кнопки нет', () => {
    flags.tasksShowAll = false;
    const el = render();
    expect(doneRows(el)).toBe(20);
    expect(el.querySelector('.tasks__more')?.textContent).toBe('Ещё 5 сделанных — в таблице');
    expect(btn(el, 'Показать все')).toBeUndefined();
  });

  it('с флагом — «Показать все» раскрывает все 25, «Свернуть» возвращает 20; на сервер ничего не пишется', () => {
    const el = render();
    expect(doneRows(el)).toBe(20);
    expect(el.querySelector('.tasks__more')).toBeNull();
    const all = btn(el, 'Показать все');
    expect(all?.textContent).toContain('ещё 5 сделанных');
    act(() => { all?.click(); });
    expect(doneRows(el)).toBe(25);
    expect(btn(el, 'Показать все')).toBeUndefined();
    act(() => { btn(el, 'Свернуть')?.click(); });
    expect(doneRows(el)).toBe(20);
    expect(writes).not.toHaveBeenCalled();
  });
});
