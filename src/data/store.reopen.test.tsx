// Находка «Пользователя» № 19 (проход 2): «Вернуть срок» в уведомлении молча ничего не делал. Уведомление создаётся в момент
// закрытия и держит store того нажатия — reopenDeadline видел старый список «закрыто» (без этого срока) и выходил.
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { Snapshot, WriteOp, WriteResult } from './api';
import type { Deadline } from './types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;

const D: Deadline = { id: 'D-1', version: 1, clientId: 'C-1', what: 'ЄП за вересень', periodicity: 'month', due: '2026-10-20', periodEnd: '2026-09-30', status: 'new', closedAt: null };
const sent: WriteOp['kind'][] = [];
let answered = 0; // ответов таблицы выдано: тест не кончается, пока не пришли все — иначе ответ долетает после снятия окружения
const write = vi.fn(async (op: WriteOp): Promise<WriteResult> => {
  sent.push(op.kind);
  await new Promise((r) => setTimeout(r, 30));
  answered += 1;
  if (op.kind === 'closeDeadline') {
    return { ok: true, changes: [{ cursor: 2, entity: 'deadline', op: 'upsert', id: 'D-1', origin: op.requestId, record: { ...D, status: 'done', closedAt: '2026-10-16', version: 2 } }], cursor: 2, notifyAt: null };
  }
  return { ok: true, changes: [{ cursor: 3, entity: 'deadline', op: 'upsert', id: 'D-1', origin: op.requestId, record: { ...D, version: 3 } }], cursor: 3 };
});

vi.mock('./session', () => ({
  liveApi: null,
  api: {
    snapshot: async (): Promise<Snapshot> => ({ clients: [], deadlines: [D], payments: [], activity: [], tasks: [], questions: [], inbox: [], cursor: 1 }),
    changesSince: async () => ({ changes: [], cursor: 1 }),
    write, listPayments: async () => ({ payments: [], totalKopecks: 0 }), listQuestions: async () => [],
  },
}));

const { StoreProvider, useStore } = await import('./store');
const settle = async () => { for (let i = 0; i < 50 && answered < sent.length; i++) await tick(); await tick(); };
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

describe('«Вернуть срок» из уведомления', () => {
  it('закрыть → действие уведомления (store момента закрытия) → срок снова открыт', async () => {
    const box: { s: ReturnType<typeof useStore> | null } = { s: null };
    function Grab() { const s = useStore(); useEffect(() => { box.s = s; }); return null; }
    const root = createRoot(document.createElement('div'));
    await act(async () => { root.render(<StoreProvider><Grab /></StoreProvider>); });
    for (let i = 0; i < 50 && !box.s?.loaded; i++) await tick();
    expect(box.s?.deadlines.map((d) => d.id)).toEqual(['D-1']);

    // Как useClose: уведомление строится в колбэке закрытия и держит store того нажатия.
    const atClose = box.s;
    let undo: (() => void) | null = null;
    await act(async () => { atClose?.closeDeadline('D-1', () => { undo = () => atClose.reopenDeadline('D-1'); }); });
    for (let i = 0; i < 100 && !undo; i++) await tick();
    expect(box.s?.deadlines).toHaveLength(0);
    expect(box.s?.closed.map((c) => c.deadline.id)).toEqual(['D-1']);

    await act(async () => { undo?.(); });
    for (let i = 0; i < 50 && !box.s?.deadlines.length; i++) await tick();
    expect(box.s?.deadlines.map((d) => d.id)).toEqual(['D-1']);
    expect(box.s?.closed).toHaveLength(0);
    for (let i = 0; i < 50 && !sent.includes('reopenDeadline'); i++) await tick();
    expect(sent).toEqual(['closeDeadline', 'reopenDeadline']);
    await settle();
    act(() => root.unmount());
  });
});

describe('строка-«призрак» (№ 24): ответ таблицы раньше конца анимации', () => {
  it('закрытие с показом через 3 с, таблица ответила раньше — «закрыто» сразу, «Вернуть срок» работает', async () => {
    sent.length = 0;
    answered = 0;
    const box: { s: ReturnType<typeof useStore> | null } = { s: null };
    function Grab() { const s = useStore(); useEffect(() => { box.s = s; }); return null; }
    const root = createRoot(document.createElement('div'));
    await act(async () => { root.render(<StoreProvider><Grab /></StoreProvider>); });
    for (let i = 0; i < 50 && !box.s?.loaded; i++) await tick();
    const atClose = box.s;
    let undo: (() => void) | null = null;
    await act(async () => { atClose?.closeDeadline('D-1', () => { undo = () => atClose.reopenDeadline('D-1'); }, 3000); });
    for (let i = 0; i < 50 && !undo; i++) await tick(); // ответ через ~30 мс — задолго до 3 с
    expect(box.s?.closed.map((c) => [c.deadline.id, c.save])).toEqual([['D-1', 'saved']]);
    await act(async () => { undo?.(); });
    for (let i = 0; i < 50 && !box.s?.deadlines.length; i++) await tick();
    expect(box.s?.deadlines.map((d) => d.id)).toEqual(['D-1']);
    await settle();
    act(() => root.unmount());
  });
});
