import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Outbox } from './outbox';
import type { OutboxEvent, OutboxItem } from './outbox';
import type { CabinetApi, WriteOp, WriteResult } from './api';

function memStorage() {
  const m = new Map<string, OutboxItem>();
  return {
    m,
    set: async (k: string, v: OutboxItem) => { m.set(k, structuredClone(v)); },
    del: async (k: string) => { m.delete(k); },
    all: async () => [...m.values()].map((v) => structuredClone(v)),
  };
}

const op = (id: string): WriteOp => ({ kind: 'cancelPayment', requestId: id, id: `p-${id}`, baseVersion: 1 });
const ok: WriteResult = { ok: true, changes: [], cursor: 1 };

function apiWith(write: (o: WriteOp) => Promise<WriteResult>): CabinetApi {
  return { snapshot: vi.fn(), changesSince: vi.fn(), write, listPayments: vi.fn(), listQuestions: vi.fn(), referenceRates: vi.fn(), referenceKved: vi.fn(), referenceKvedAll: vi.fn(), clientCard: vi.fn(), remindClient: vi.fn(), remindPreview: vi.fn(), cancelNotify: vi.fn(), createDeadline: vi.fn(), previewTemplate: vi.fn(), applyTemplate: vi.fn(), clientBotLink: vi.fn(), statementPdf: vi.fn(), statementPreview: vi.fn(), sendStatement: vi.fn(), listArchive: vi.fn(), attention: vi.fn(), monthGet: vi.fn(), monthSet: vi.fn(), inboxHideAll: vi.fn() };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('очередь записей', () => {
  // Паузы повтора со случайной добавкой до 1 с — в тестах без неё, чтобы считать время точно.
  beforeEach(() => { vi.spyOn(Math, 'random').mockReturnValue(0); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('SERVER, который сервер назвал повторяемым, — ещё 2 раза через 5 с тем же requestId, потом «не сохранилось»', async () => {
    vi.useFakeTimers();
    const seen: string[] = [];
    const store = memStorage();
    const ob = new Outbox(apiWith(async (o) => { seen.push(o.requestId); return { ok: false, code: 'SERVER', message: 'Лист занят', retryable: true }; }), store, () => undefined);
    await ob.enqueue(op('s'), 'S');
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(seen).toEqual(['s', 's', 's']);
    expect(store.m.get('s')?.state).toBe('failed');
    vi.useRealTimers();
  });

  it('окно «Отменить»: запись ждёт 10 с, другие её не ждут; отмена в окне — не уходит, после окна — false', async () => {
    vi.useFakeTimers();
    const sent: string[] = [];
    const store = memStorage();
    const ob = new Outbox(apiWith(async (o) => { sent.push(o.requestId); return ok; }), store, () => undefined);
    await ob.enqueue(op('held'), 'Нет', 10_000);
    await ob.enqueue(op('plain'), 'Платёж');
    await ob.enqueue(op('held2'), 'Ответ', 10_000);
    await vi.advanceTimersByTimeAsync(100);
    expect(sent).toEqual(['plain']);
    expect(store.m.has('held')).toBe(true); // уже в хранилище — переживёт закрытие вкладки
    expect(await ob.cancelHeld('held')).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sent).toEqual(['plain', 'held2']);
    expect(await ob.cancelHeld('held2')).toBe(false);
    expect(store.m.size).toBe(0);
    vi.useRealTimers();
  });

  it('отправляет по порядку и считает ступени', async () => {
    const order: string[] = [];
    const store = memStorage();
    const ob = new Outbox(apiWith(async (o) => { order.push(o.requestId); return ok; }), store, () => undefined);
    await ob.enqueue(op('a'), 'A');
    await ob.enqueue(op('b'), 'B');
    for (let i = 0; i < 5; i++) await flush();
    expect(order).toEqual(['a', 'b']);
    expect(store.m.size).toBe(0);
    expect(ob.counters).toMatchObject({ entered: 2, sent: 2, accepted: 2, applied: 2, rejected: 0 });
  });

  it('без связи — запись остаётся в хранилище и уходит, когда связь вернулась', async () => {
    vi.useFakeTimers();
    let online = false;
    const store = memStorage();
    const events: OutboxEvent['type'][] = [];
    const ob = new Outbox(apiWith(async () => (online ? ok : { ok: false, code: 'NETWORK', message: 'нет связи' })), store, (e) => events.push(e.type));
    await ob.enqueue(op('a'), 'A');
    await vi.advanceTimersByTimeAsync(0);
    expect(store.m.get('a')?.state).toBe('queued');
    expect(events).toContain('offline');
    online = true;
    await vi.advanceTimersByTimeAsync(2000);
    expect(store.m.size).toBe(0);
    expect(events).toContain('applied');
    vi.useRealTimers();
  });

  it('после перезагрузки подхватывает недоотправленное', async () => {
    const store = memStorage();
    store.m.set('x', { op: op('x'), label: 'X', createdAt: 1, attempts: 1, state: 'sending' });
    const sent: string[] = [];
    const ob = new Outbox(apiWith(async (o) => { sent.push(o.requestId); return ok; }), store, () => undefined);
    await ob.load();
    for (let i = 0; i < 5; i++) await flush();
    expect(sent).toEqual(['x']);
  });

  it('конфликт и отказ не теряют запись и не держат очередь', async () => {
    const store = memStorage();
    const ob = new Outbox(apiWith(async (o) => (o.requestId === 'a'
      ? { ok: false, code: 'CONFLICT', message: 'изменилась' }
      : o.requestId === 'b' ? { ok: false, code: 'SERVER', message: 'сбой' } : ok)), store, () => undefined);
    await ob.enqueue(op('a'), 'A');
    await ob.enqueue(op('b'), 'B');
    await ob.enqueue(op('c'), 'C');
    for (let i = 0; i < 10; i++) await flush();
    expect(store.m.get('a')?.state).toBe('conflict');
    expect(store.m.get('b')?.state).toBe('failed');
    expect(store.m.has('c')).toBe(false);
    expect(ob.counters.rejected).toBe(2);
  });
});

describe('ночное обслуживание', () => {
  it('ждёт retryAt от сервера, а не короткую паузу', async () => {
    vi.useFakeTimers();
    const start = Date.now();
    let calls = 0;
    const store = memStorage();
    const ob = new Outbox(apiWith(async () => {
      calls++;
      return calls === 1
        ? { ok: false, code: 'MAINTENANCE', message: 'обслуживание', retryAt: new Date(start + 60_000).toISOString() }
        : ok;
    }), store, () => undefined);
    await ob.enqueue(op('a'), 'A');
    await vi.advanceTimersByTimeAsync(30_000);
    void ob.kick(true); // опрос таблицы / связь вернулась — retryAt всё равно не обгоняем
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(1);
    expect(store.m.get('a')?.state).toBe('queued');
    await vi.advanceTimersByTimeAsync(31_000);
    expect(calls).toBe(2);
    expect(store.m.size).toBe(0);
    vi.useRealTimers();
  });
});
