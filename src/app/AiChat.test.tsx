// Помощник: «Думает…» до ответа, ответ в ленте, вопрос из карточки клиента — с clientId; «лимит» — сообщением,
// «выключен» — поле закрыто. История — только в памяти (в localStorage ничего не пишется).
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { AiAnswer, Snapshot } from '../data/api';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
Element.prototype.scrollTo ??= function scrollTo() { /* jsdom */ };

let reply: (q: string) => AiAnswer = () => ({ ok: true, kind: 'reply', answer: 'Ответ', sources: [] });
const aiAsk = vi.fn(async (q: string) => { await new Promise((r) => setTimeout(r, 60)); return reply(q); });
const SNAP: Snapshot = {
  clients: [{ id: 'C-1', version: 1, name: 'Ромашко Олена Петрівна', kind: 'fop2', marks: [], employer: false, kved: [], phone: '', keyIssuer: '', keyUntil: null, monthly: [] }],
  deadlines: [], payments: [], activity: [], tasks: [], questions: [], inbox: [], cursor: 1,
};

vi.mock('../data/session', () => ({
  liveApi: null,
  api: {
    snapshot: async () => SNAP, changesSince: async () => ({ changes: [], cursor: 1 }), write: vi.fn(),
    aiAsk, listPayments: async () => ({ payments: [], totalKopecks: 0 }), listQuestions: async () => [],
  },
}));

const { StoreProvider } = await import('../data/store');
const { AiChat } = await import('./AiChat');
const tick = (ms = 20) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

function type(el: HTMLTextAreaElement, v: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

async function mount(clientId: string | null) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => { root.render(<StoreProvider><AiChat clientId={clientId} /></StoreProvider>); });
  await tick(100);
  return { host, root };
}

describe('помощник', () => {
  it('думает → ответ; из карточки — с clientId и подписью; в localStorage ничего', async () => {
    const before = localStorage.length;
    const { host, root } = await mount('C-1');
    await act(async () => { host.querySelector<HTMLButtonElement>('.ai-fab')?.click(); });
    const q = host.querySelector<HTMLTextAreaElement>('.ai-form__q');
    expect(host.querySelector('.ai-form__about')?.textContent).toContain('Ромашко');
    await act(async () => { if (q) type(q, 'Что сдать?'); });
    await act(async () => { host.querySelector<HTMLFormElement>('.ai-form')?.requestSubmit(); });
    expect(host.querySelector('.ai-msg--wait')?.textContent).toContain('Думает');
    await tick(120);
    expect(aiAsk).toHaveBeenLastCalledWith('Что сдать?', 'C-1');
    expect(host.querySelector('.ai-msg--wait')).toBeNull();
    expect([...host.querySelectorAll('.ai-msg__text')].map((x) => x.textContent)).toEqual(['Что сдать?', 'Ответ']);
    expect(localStorage.length).toBe(before);
    act(() => root.unmount());
  });

  it('лимит — сообщением в ленте; «выключен» — поле закрыто с причиной', async () => {
    const { host, root } = await mount(null);
    await act(async () => { host.querySelector<HTMLButtonElement>('.ai-fab')?.click(); });
    const q = () => host.querySelector<HTMLTextAreaElement>('.ai-form__q');
    reply = () => ({ ok: true, kind: 'refusal', answer: 'Об этом не подскажу', sources: [] });
    await act(async () => { const el = q(); if (el) type(el, 'не по теме'); });
    await act(async () => { host.querySelector<HTMLFormElement>('.ai-form')?.requestSubmit(); });
    await tick(120);
    expect([host.querySelector('.ai-msg--refusal')?.textContent, host.querySelector('.ai-msg--err')]).toEqual(['Об этом не подскажу', null]);
    reply = () => ({ ok: false, reason: 'limit', message: 'Лимит на сегодня' });
    await act(async () => { const el = q(); if (el) type(el, 'вопрос'); });
    await act(async () => { host.querySelector<HTMLFormElement>('.ai-form')?.requestSubmit(); });
    await tick(120);
    expect(aiAsk).toHaveBeenLastCalledWith('вопрос', null);
    expect(host.querySelector('.ai-msg--err')?.textContent).toContain('Лимит на сегодня');
    expect(q()?.disabled).toBe(false);
    reply = () => ({ ok: false, reason: 'off', message: 'Помощник выключен' });
    await act(async () => { const el = q(); if (el) type(el, 'ещё'); });
    await act(async () => { host.querySelector<HTMLFormElement>('.ai-form')?.requestSubmit(); });
    await tick(120);
    expect([q()?.disabled, q()?.placeholder]).toEqual([true, 'Помощник выключен']);
    act(() => root.unmount());
  });
});
