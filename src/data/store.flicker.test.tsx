// Приёмка-5, Р-7: после «Отменить» строка мигала — опрос журнала приносил прежнее «платёж записан» / «срок закрыт» и
// перекрывал отмену, пока та ещё шла до сервера. Проверяем промежуточные моменты 500 / 1000 / 1500 / 2000 мс, не только итог.
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { Change, Snapshot, WriteOp, WriteResult } from './api';
import type { Deadline, Payment } from './types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;

const D: Deadline = { id: 'D-1', version: 1, clientId: 'C-1', what: 'ЄП за вересень', periodicity: 'month', due: '2026-10-20', periodEnd: '2026-09-30', status: 'new', closedAt: null };
const P = (id: string, v = 1): Payment => ({ id, version: v, clientId: 'C-1', kopecks: 150000, period: 'Октябрь 2026', method: 'bank', date: '2026-10-14', source: 'сайт' });
let log: Change[] = [];
const write = vi.fn(async (op: WriteOp): Promise<WriteResult> => {
  if (op.kind === 'addPayment') {
    const ch: Change = { cursor: 2, entity: 'payment', op: 'upsert', id: op.payment.id, origin: op.requestId, record: P(op.payment.id) };
    log.push(ch);
    return { ok: true, changes: [ch], cursor: 2 };
  }
  if (op.kind === 'closeDeadline') {
    const ch: Change = { cursor: 3, entity: 'deadline', op: 'upsert', id: 'D-1', origin: op.requestId, record: { ...D, status: 'done', closedAt: '2026-10-14', version: 2 } };
    log.push(ch);
    return { ok: true, changes: [ch], cursor: 3, notifyAt: null };
  }
  // Отмена идёт до сервера 2,5 с — в это время опрос журнала приносит прежнюю запись.
  await new Promise((r) => setTimeout(r, 2500));
  if (op.kind === 'cancelPayment') return { ok: true, changes: [{ cursor: 4, entity: 'payment', op: 'delete', id: op.id, origin: op.requestId }], cursor: 4 };
  if (op.kind === 'reopenDeadline') return { ok: true, changes: [{ cursor: 5, entity: 'deadline', op: 'upsert', id: 'D-1', origin: op.requestId, record: { ...D, version: 3 } }], cursor: 5 };
  return { ok: true, changes: [], cursor: 1 };
});

vi.mock('./session', () => ({
  liveApi: null,
  api: {
    snapshot: async (): Promise<Snapshot> => ({ clients: [], deadlines: [D], payments: [], activity: [], tasks: [], questions: [], inbox: [], cursor: 1 }),
    // Журнал отдаёт всё, что было после курсора 1, — как сервер, пока курсор сайта не ушёл дальше.
    changesSince: async () => ({ changes: [...log], cursor: Math.max(1, ...log.map((c) => c.cursor)) }),
    write, listPayments: async () => ({ payments: [], totalKopecks: 0 }), listQuestions: async () => [],
  },
}));

const { StoreProvider, useStore } = await import('./store');
const tick = (ms = 20) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

async function mount() {
  const box: { s: ReturnType<typeof useStore> | null } = { s: null };
  function Grab() { const s = useStore(); useEffect(() => { box.s = s; }); return null; }
  const root = createRoot(document.createElement('div'));
  await act(async () => { root.render(<StoreProvider><Grab /></StoreProvider>); });
  for (let i = 0; i < 50 && !box.s?.loaded; i++) await tick();
  return { box, root };
}

/** Смотрим в 500, 1000, 1500, 2000 мс после отмены: где запись — на экране или нет. */
async function timeline(check: () => boolean): Promise<boolean[]> {
  const seen: boolean[] = [];
  for (let i = 0; i < 4; i++) { await tick(500); seen.push(check()); }
  return seen;
}

describe('«Отменить» не мигает (Р-7)', () => {
  it('платёж: после «Отменить» строки нет ни на 500, ни на 1000, 1500, 2000 мс', async () => {
    log = [];
    const { box, root } = await mount();
    let pid = '';
    await act(async () => { pid = box.s?.addPayment({ clientId: 'C-1', kopecks: 150000, period: 'Октябрь 2026', method: 'bank', date: '2026-10-14' }) ?? ''; });
    for (let i = 0; i < 50 && box.s?.payments.find((p) => p.id === pid)?.save !== 'saved'; i++) await tick();
    await act(async () => { box.s?.removePayment(pid); });
    expect(await timeline(() => Boolean(box.s?.payments.some((p) => p.id === pid)))).toEqual([false, false, false, false]);
    act(() => root.unmount());
  });

  it('«Вернуть срок»: после «Вернуть» срок открыт на 500, 1000, 1500, 2000 мс и не в «Закрыто сегодня»', async () => {
    log = [];
    const { box, root } = await mount();
    let undo: (() => void) | null = null;
    const atClose = box.s;
    await act(async () => { atClose?.closeDeadline('D-1', () => { undo = () => atClose.reopenDeadline('D-1'); }); });
    for (let i = 0; i < 100 && !undo; i++) await tick();
    await act(async () => { undo?.(); });
    expect(await timeline(() => Boolean(box.s?.deadlines.some((d) => d.id === 'D-1')) && !box.s?.closed.some((c) => c.deadline.id === 'D-1')))
      .toEqual([true, true, true, true]);
    act(() => root.unmount());
  });
});
