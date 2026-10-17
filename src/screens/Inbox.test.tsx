// «Убрать с сайта» во «Входящих» (повторная приёмка-5, Н-3): нерешённое одним нажатием не убирается.
// Строка чата с нерешёнными — без кнопки; шапка такой переписки — сначала вопрос; у нерешённого сообщения кнопки нет.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InboxItem } from '../data/types';

const msg = (id: string, clientId: string, name: string, status: InboxItem['status'], at: string): InboxItem =>
  ({ id, at, clientId, clientName: name, type: 'question', snippet: `Текст ${id}`, status });

// Калиновська: 2 нерешённых (как в приёмке); Ромашко: всё решено
const ITEMS: InboxItem[] = [
  msg('k1', 'c1', 'Калиновська Ірина', 'new', '2026-10-14T08:52:00'),
  msg('k2', 'c1', 'Калиновська Ірина', 'new', '2026-10-14T08:55:00'),
  msg('r1', 'c2', 'Ромашко Олена', 'accepted', '2026-10-13T09:00:00'),
];
const hide = vi.fn((ids: string[]) => `rid-${ids.length}`);
let route = { name: 'inbox', params: [] as string[] };

vi.mock('../data/store', () => ({
  HOLD_MS: 10_000,
  useStore: () => ({
    inbox: ITEMS, inboxHide: { hide, clearRead: async () => ({ hidden: 0, undo: () => undefined }) },
    client: () => undefined, pending: [], fresh: [], online: true, undoHeld: async () => true,
  }),
}));
vi.mock('../router', () => ({ useRoute: () => route, navigate: () => undefined, toHash: () => '#/' }));

// jsdom без matchMedia и ResizeObserver, а модули интерфейса спрашивают их при загрузке.
window.matchMedia ??= ((q: string) => ({ matches: q.includes('min-width: 900px') || q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;

// jsdom не листает: лента при открытии переписки зовёт scrollTo
Element.prototype.scrollTo ??= function scrollTo() {};

const { Inbox } = await import('./Inbox');

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => { hide.mockClear(); });

let host: HTMLDivElement;
afterEach(() => { host.remove(); });

function render(): HTMLDivElement {
  host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => { root.render(<Inbox />); });
  return host;
}

const rowOf = (el: HTMLElement, name: string) => [...el.querySelectorAll<HTMLLIElement>('.chats__list li')].find((li) => li.textContent?.includes(name));

describe('«Убрать с сайта»: нерешённое не убирается одним нажатием', () => {
  it('строка чата с нерешёнными — без кнопки; всё решено — кнопка есть', () => {
    const el = render();
    expect(rowOf(el, 'Калиновська')?.querySelector('.chat__hide')).toBeNull();
    expect(rowOf(el, 'Ромашко')?.querySelector('.chat__hide')).not.toBeNull();
  });

  it('шапка переписки с нерешёнными: сначала вопрос, без согласия ничего не убрано', () => {
    route = { name: 'inbox', params: ['c1'] };
    const el = render();
    act(() => { el.querySelector<HTMLButtonElement>('.dialog__hide')?.click(); });
    expect(hide).not.toHaveBeenCalled();
    expect(el.querySelector('.dialog__ask')?.textContent).toContain('2 сообщения ждут решения');
    act(() => { el.querySelector<HTMLButtonElement>('.dialog__ask .btn--ghost')?.click(); });
    expect(el.querySelector('.dialog__ask')).toBeNull();
    expect(hide).not.toHaveBeenCalled();
    act(() => { el.querySelector<HTMLButtonElement>('.dialog__hide')?.click(); });
    act(() => { el.querySelector<HTMLButtonElement>('.dialog__ask .btn--primary')?.click(); });
    expect(hide).toHaveBeenCalledWith(['k1', 'k2']);
  });

  it('у нерешённого сообщения кнопки нет', () => {
    route = { name: 'inbox', params: ['c1'] };
    const el = render();
    expect(el.querySelectorAll('.bubble.is-new .bubble__hide')).toHaveLength(0);
    expect(el.querySelectorAll('.bubble.is-new')).toHaveLength(2);
  });
});
