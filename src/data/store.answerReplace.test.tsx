// Замена записанного ответа (флаг answerReplace): store.answerQuestion(id, text, onSaved, true) шлёт операцию с replace: true
// сразу (без 10 с «Отменить»); обычный первый ответ — без replace и с ожиданием; отказ сервера (VALIDATION) показывается
// уведомлением с его текстом, и вопрос в списке не появляется.
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { Snapshot, WriteOp, WriteResult } from './api';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;

const SNAP: Snapshot = { clients: [], deadlines: [], payments: [], activity: [], tasks: [], questions: [], inbox: [], cursor: 1 };
const write = vi.fn(async (op: WriteOp): Promise<WriteResult> => (op.kind === 'answerQuestion' && op.text === 'Нет'
  ? { ok: false, code: 'VALIDATION', message: 'Это «Да» уже применено — изменить ответ нельзя' }
  : { ok: true, changes: [], cursor: 1 }));

vi.mock('./session', () => ({
  liveApi: null,
  api: { snapshot: async () => SNAP, changesSince: async () => ({ changes: [], cursor: 1 }), write, listPayments: async () => ({ payments: [], totalKopecks: 0 }), listQuestions: async () => [] },
}));

const { StoreProvider, useStore } = await import('./store');

describe('замена ответа на вопрос', () => {
  it('replace: true уходит сразу; принято — onSaved; отказ сервера — уведомление с его текстом', async () => {
    const box: { s: ReturnType<typeof useStore> | null } = { s: null };
    function Grab() { const s = useStore(); useEffect(() => { box.s = s; }); return null; }
    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () => { root.render(<StoreProvider><Grab /></StoreProvider>); });
    for (let i = 0; i < 50 && !box.s?.loaded; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

    const saved = vi.fn();
    await act(async () => { box.s?.answerQuestion('Q-1', 'Да', saved, true); });
    for (let i = 0; i < 50 && !saved.mock.calls.length; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(saved).toHaveBeenCalledTimes(1);
    expect(write.mock.calls.map((c) => c[0])).toEqual([expect.objectContaining({ kind: 'answerQuestion', id: 'Q-1', text: 'Да', replace: true })]);

    await act(async () => { box.s?.answerQuestion('Q-1', 'Нет', undefined, true); });
    for (let i = 0; i < 50 && !box.s?.notices.length; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(box.s?.notices.map((n) => n.text)).toEqual(['Изменение ответа: Это «Да» уже применено — изменить ответ нельзя']);
    expect(box.s?.questions).toEqual([]);
    expect(box.s?.pending.filter((p) => p.op.kind === 'answerQuestion')).toEqual([]);

    // первый ответ — без replace и с ожиданием «Отменить»: за 0,3 с на сервер не уходит
    write.mockClear();
    await act(async () => { box.s?.answerQuestion('Q-2', 'Да'); });
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    expect(write).not.toHaveBeenCalled();
    expect(box.s?.pending.map((p) => p.op)).toEqual([expect.not.objectContaining({ replace: true })]);
    act(() => root.unmount());
  });
});
