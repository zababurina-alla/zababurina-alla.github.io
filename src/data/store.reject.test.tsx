// Окончательный отказ таблицы в новой задаче (VALIDATION) — задача уходит с экрана, а не стоит как записанная при
// «Всё сохранено» (вечерняя проверка 15.10: тестового клиента удалили, tasks.create → VALIDATION clientId).
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { Snapshot, WriteOp, WriteResult } from './api';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;

const SNAP: Snapshot = { clients: [], deadlines: [], payments: [], activity: [], tasks: [], questions: [], inbox: [], cursor: 1 };
const write = vi.fn(async (op: WriteOp): Promise<WriteResult> => (await new Promise((r) => setTimeout(r, 100)), op.kind === 'createTask'
  ? { ok: false, code: 'VALIDATION', message: 'Выберите клиента' }
  : { ok: true, changes: [], cursor: 1 }));

vi.mock('./session', () => ({
  liveApi: null,
  api: { snapshot: async () => SNAP, changesSince: async () => ({ changes: [], cursor: 1 }), write, listPayments: async () => ({ payments: [], totalKopecks: 0 }), listQuestions: async () => [] },
}));

const { StoreProvider, useStore } = await import('./store');

describe('отказ таблицы в новой задаче', () => {
  it('VALIDATION — задачи на экране нет, в очереди не висит', async () => {
    let store: ReturnType<typeof useStore> | null = null;
    function Grab() { const s = useStore(); useEffect(() => { store = s; }); return null; }
    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () => { root.render(<StoreProvider><Grab /></StoreProvider>); });
    for (let i = 0; i < 50 && !store?.loaded; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    await act(async () => { store?.addTask({ clientId: 'C-117', text: 'Проверка сайта', due: null, type: 'docs', priority: 'medium' }); });
    expect(store?.tasks.map((t) => t.text)).toEqual(['Проверка сайта']); // сразу видна, «сохраняется»
    for (let i = 0; i < 100 && (store?.tasks.length ?? 0) > 0; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(write).toHaveBeenCalled();
    expect(store?.tasks).toEqual([]);
    expect(store?.pending.filter((p) => p.op.kind === 'createTask')).toEqual([]);
    act(() => root.unmount());
  });
});
