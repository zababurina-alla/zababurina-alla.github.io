// Консультации: ответ сервера (v5.87) приходит с id = requestId — запись остаётся на экране одна, не пропадает;
// consultationsSkipped — свой список не затирается пустым.
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { Snapshot, WriteOp, WriteResult } from './api';
import type { Consultation } from './types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;

const K: Consultation = { id: 'K-1', version: 1, clientId: 'C-1', at: '2026-10-10T10:00', topic: 'Старая', minutes: 10, note: '' };
let snap: Snapshot = { clients: [], deadlines: [], payments: [], activity: [], tasks: [], questions: [], inbox: [], consultations: [K], cursor: 1 };
const write = vi.fn(async (op: WriteOp): Promise<WriteResult> => {
  if (op.kind !== 'createConsultation') throw new Error('не та запись');
  const rec = { ...op.consultation, version: 1, at: '2026-10-16T21:00' };
  return { ok: true, changes: [{ cursor: 2, entity: 'consultation', op: 'upsert', id: op.requestId, origin: op.requestId, record: rec }], cursor: 2 };
});

vi.mock('./session', () => ({
  liveApi: null,
  api: {
    snapshot: async () => snap,
    changesSince: async () => ({ changes: [], cursor: 2 }),
    write, listPayments: async () => ({ payments: [], totalKopecks: 0 }), listQuestions: async () => [],
  },
}));

const { StoreProvider, useStore } = await import('./store');
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

describe('консультации в store', () => {
  it('записанная консультация остаётся одна с датой сервера; skipped не затирает список', async () => {
    const box: { s: ReturnType<typeof useStore> | null } = { s: null };
    function Grab() { const s = useStore(); useEffect(() => { box.s = s; }); return null; }
    const root = createRoot(document.createElement('div'));
    await act(async () => { root.render(<StoreProvider><Grab /></StoreProvider>); });
    for (let i = 0; i < 50 && !box.s?.loaded; i++) await tick();
    expect(box.s?.consultations.map((k) => k.id)).toEqual(['K-1']);

    await act(async () => { box.s?.addConsultation({ clientId: 'C-1', topic: 'Новая', minutes: 20, note: '' }); });
    for (let i = 0; i < 100 && !box.s?.consultations.some((k) => k.at === '2026-10-16T21:00'); i++) await tick();
    const fresh = box.s?.consultations.filter((k) => k.topic === 'Новая') ?? [];
    expect(fresh).toHaveLength(1);
    expect(fresh[0]?.at).toBe('2026-10-16T21:00');

    snap = { ...snap, consultations: [], consultationsSkipped: true };
    await act(async () => { box.s?.reload(); });
    for (let i = 0; i < 50 && !box.s?.loaded; i++) await tick();
    await tick();
    expect(box.s?.consultations.map((k) => k.topic).sort()).toEqual(['Новая', 'Старая']);
    act(() => root.unmount());
  });
});
