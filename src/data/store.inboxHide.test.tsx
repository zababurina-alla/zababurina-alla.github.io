// «Удалить» и «Очистить прочитанное» во «Входящих» (только на сайте, флаг inboxHide; в тесте — учебный режим, флаг включён):
// убрать → 10 с на «Отменить» → без отмены уходит inbox.hide; «Очистить прочитанное» → inbox.hideAll, «Отменить» → inbox.unhide.
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { Snapshot, WriteOp, WriteResult } from './api';
import type { InboxItem } from './types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;

const m = (id: string, status: InboxItem['status']): InboxItem =>
  ({ id, version: 1, at: '2026-10-16T09:00', clientId: 'C-1', clientName: 'Тестовий', type: 'question', snippet: id, amount: null, status });
const SNAP: Snapshot = { clients: [], deadlines: [], payments: [], activity: [], tasks: [], questions: [], inbox: [m('I-1', 'new'), m('I-2', 'accepted'), m('I-3', 'rejected')], cursor: 1 };
const sent: WriteOp[] = [];
const write = vi.fn(async (op: WriteOp): Promise<WriteResult> => {
  sent.push(op);
  if (op.kind === 'unhideInbox') return { ok: true, changes: op.ids.map((id) => ({ cursor: 3, entity: 'inbox' as const, op: 'upsert' as const, id, origin: op.requestId, record: m(id, 'accepted') })), cursor: 3, failed: [] };
  return { ok: true, changes: [], cursor: 2, failed: [] };
});
const hideAll = vi.fn(async () => ({ hidden: 2, ids: ['I-2', 'I-3'], more: false }));

vi.mock('./session', () => ({
  liveApi: null,
  api: {
    snapshot: async () => SNAP,
    changesSince: async () => ({ changes: [], cursor: 1 }),
    write, inboxHideAll: hideAll, listPayments: async () => ({ payments: [], totalKopecks: 0 }), listQuestions: async () => [],
  },
}));

const { StoreProvider, useStore } = await import('./store');
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

describe('«Входящие»: убрать с сайта', () => {
  it('убрать → «Отменить» в окне: сообщение на месте, inbox.hide не ушёл; «Очистить прочитанное» → «Отменить» возвращает', async () => {
    const box: { s: ReturnType<typeof useStore> | null } = { s: null };
    function Grab() { const s = useStore(); useEffect(() => { box.s = s; }); return null; }
    const root = createRoot(document.createElement('div'));
    await act(async () => { root.render(<StoreProvider><Grab /></StoreProvider>); });
    for (let i = 0; i < 50 && !box.s?.loaded; i++) await tick();
    expect(box.s?.inboxHide).not.toBeNull();

    let rid = '';
    await act(async () => { rid = box.s?.inboxHide?.hide(['I-1']) ?? ''; });
    expect(box.s?.inbox.map((x) => x.id)).toEqual(['I-2', 'I-3']);
    await act(async () => { await box.s?.undoHeld(rid); });
    expect(box.s?.inbox.map((x) => x.id).sort()).toEqual(['I-1', 'I-2', 'I-3']);
    await tick();
    expect(sent.filter((o) => o.kind === 'hideInbox')).toHaveLength(0);

    let undo: (() => void) | null = null;
    await act(async () => { const r = await box.s?.inboxHide?.clearRead(); undo = r?.undo ?? null; expect(r?.hidden).toBe(2); });
    expect(box.s?.inbox.map((x) => x.id)).toEqual(['I-1']);
    await act(async () => { undo?.(); });
    for (let i = 0; i < 50 && !sent.some((o) => o.kind === 'unhideInbox'); i++) await tick();
    expect(sent.filter((o) => o.kind === 'unhideInbox').map((o) => o.kind === 'unhideInbox' && o.ids)).toEqual([['I-2', 'I-3']]);
    expect(box.s?.inbox.map((x) => x.id).sort()).toEqual(['I-1', 'I-2', 'I-3']);
    // Возвращённое — своё: уведомления «Новое сообщение» нет.
    expect(box.s?.notices.filter((n) => n.text.startsWith('Новое сообщение'))).toHaveLength(0);
    act(() => root.unmount());
  });
});
