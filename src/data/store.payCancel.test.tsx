// Приёмка-6, находка 2: только что записанный платёж (save='saved', в сеансе) отменяется так же, как старый:
// removePayment отправляет payments.cancel с версией, пришедшей в ответе таблицы; «сохранено» до отмены не теряется.
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { Change, Snapshot, WriteOp, WriteResult } from './api';
import type { Payment } from './types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;

const SAVED = (id: string): Payment => ({ id, version: 7, clientId: 'C-1', kopecks: 150000, period: 'Октябрь 2026', method: 'bank', date: '2026-10-14', source: 'сайт' });
const sent: WriteOp[] = [];
const write = vi.fn(async (op: WriteOp): Promise<WriteResult> => {
  sent.push(op);
  if (op.kind === 'addPayment') {
    const ch: Change = { cursor: 2, entity: 'payment', op: 'upsert', id: op.payment.id, origin: op.requestId, record: SAVED(op.payment.id) };
    return { ok: true, changes: [ch], cursor: 2 };
  }
  if (op.kind === 'cancelPayment') return { ok: true, changes: [{ cursor: 3, entity: 'payment', op: 'delete', id: op.id, origin: op.requestId }], cursor: 3 };
  return { ok: true, changes: [], cursor: 1 };
});

vi.mock('./session', () => ({
  liveApi: null,
  api: {
    snapshot: async (): Promise<Snapshot> => ({ clients: [], deadlines: [], payments: [], activity: [], tasks: [], questions: [], inbox: [], cursor: 1 }),
    changesSince: async () => ({ changes: [], cursor: 1 }),
    write, listPayments: async () => ({ payments: [], totalKopecks: 0 }), listQuestions: async () => [],
  },
}));

const { StoreProvider, useStore } = await import('./store');
const tick = (ms = 20) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

describe('отмена платежа, записанного в этом сеансе', () => {
  it('после ответа таблицы «в таблице» держится, removePayment шлёт payments.cancel с версией ответа, строка уходит', async () => {
    const box: { s: ReturnType<typeof useStore> | null } = { s: null };
    function Grab() { const s = useStore(); useEffect(() => { box.s = s; }); return null; }
    const root = createRoot(document.createElement('div'));
    await act(async () => { root.render(<StoreProvider><Grab /></StoreProvider>); });
    for (let i = 0; i < 50 && !box.s?.loaded; i++) await tick();

    let pid = '';
    await act(async () => { pid = box.s?.addPayment({ clientId: 'C-1', kopecks: 150000, period: 'Октябрь 2026', method: 'bank', date: '2026-10-14' }) ?? ''; });
    for (let i = 0; i < 50 && box.s?.payments.find((p) => p.id === pid)?.save !== 'saved'; i++) await tick();
    expect(box.s?.payments.find((p) => p.id === pid)?.save).toBe('saved');

    await act(async () => { box.s?.removePayment(pid); });
    for (let i = 0; i < 50 && box.s?.payments.some((p) => p.id === pid); i++) await tick();
    const cancel = sent.find((o) => o.kind === 'cancelPayment');
    expect(cancel).toMatchObject({ kind: 'cancelPayment', id: pid, baseVersion: 7 });
    expect(box.s?.payments.some((p) => p.id === pid)).toBe(false);
    act(() => root.unmount());
  });
});
