// «Входящие» на сайте: новое сообщение клиента из синхронизации — заметное уведомление со ссылкой; «уже решено» в
// Telegram (CONFLICT с current) — спокойная подсказка «Уже решено: записано», а не ошибка; сообщение встаёт в статус.
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { Change, Snapshot, WriteResult } from './api';
import type { InboxItem } from './types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;

const ITEM: InboxItem = { id: 'I-1', version: 1, at: '2026-10-16T19:00', clientId: 'C-1', clientName: 'Тестовий клієнт', type: 'payment', snippet: 'Сплатив 1 200 грн', amount: 120000, status: 'new', file: false, taxKopecks: null };
const SNAP: Snapshot = { clients: [], deadlines: [], payments: [], activity: [], tasks: [], questions: [], inbox: [], cursor: 1 };
let feed: Change[] = [];
const write = vi.fn(async (): Promise<WriteResult> => {
  await new Promise((r) => setTimeout(r, 50));
  return { ok: false, code: 'CONFLICT', message: 'Уже решено', current: { ...ITEM, status: 'accepted' } };
});

vi.mock('./session', () => ({
  liveApi: null,
  api: {
    snapshot: async () => SNAP,
    changesSince: async () => { const changes = feed; feed = []; return { changes, cursor: 2 }; },
    write, listPayments: async () => ({ payments: [], totalKopecks: 0 }), listQuestions: async () => [],
  },
}));

const { StoreProvider, useStore } = await import('./store');
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

describe('входящие на сайте', () => {
  it('новое сообщение — уведомление «Открыть» → #/inbox; «уже решено» — подсказка и статус из current', async () => {
    const box: { s: ReturnType<typeof useStore> | null } = { s: null };
    function Grab() { const s = useStore(); useEffect(() => { box.s = s; }); return null; }
    const root = createRoot(document.createElement('div'));
    await act(async () => { root.render(<StoreProvider><Grab /></StoreProvider>); });
    for (let i = 0; i < 50 && !box.s?.loaded; i++) await tick();

    feed = [{ cursor: 2, entity: 'inbox', op: 'upsert', id: 'I-1', origin: 'бот', record: ITEM }];
    await act(async () => { await box.s?.syncNow(); });
    expect(box.s?.inbox.map((x) => x.id)).toEqual(['I-1']);
    const fresh = box.s?.notices.find((n) => n.text.startsWith('Новое сообщение'));
    expect(fresh).toMatchObject({ info: true, href: '#/inbox' });
    expect(fresh?.text).toContain('Тестовий клієнт');

    await act(async () => { box.s?.decideInbox('I-1', 'accept'); });
    for (let i = 0; i < 100 && box.s?.inbox[0]?.status === 'accepted' && !box.s?.notices.some((n) => n.text.startsWith('Уже решено')); i++) await tick();
    expect(box.s?.notices.find((n) => n.text.startsWith('Уже решено'))).toMatchObject({ text: 'Уже решено: записано — Тестовий клієнт', info: true });
    expect(box.s?.inbox[0]?.status).toBe('accepted');
    act(() => root.unmount());
  });
});
