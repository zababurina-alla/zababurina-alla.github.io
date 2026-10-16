import { describe, expect, it, vi } from 'vitest';
import { LiveApi } from './liveApi';
import type { SessionProvider } from './liveApi';
import { ApiError, call } from './transport';
import type { Deadline, Payment } from './types';

const URL_ = 'https://script.google.com/macros/s/TEST/exec';

interface Sent { action: string; session?: string; requestId?: string; payload: Record<string, unknown>; v: number }

/** Подставной сервер: отвечает по очереди заготовками и запоминает, что ему прислали. */
function server(...replies: unknown[]) {
  const sent: Sent[] = [];
  const inits: RequestInit[] = [];
  const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
    inits.push(init ?? {});
    // sentAt (часы браузера) — в каждом запросе; проверяем здесь и убираем, чтобы тела сравнивались по смыслу.
    const body = JSON.parse(String(init?.body)) as Sent & { sentAt?: unknown };
    if (typeof body.sentAt !== 'number' || Math.abs(body.sentAt - Date.now()) > 60_000) throw new Error('нет sentAt');
    delete body.sentAt;
    sent.push(body);
    const r = replies.shift();
    if (r instanceof Error) throw r;
    return new Response(typeof r === 'string' ? r : JSON.stringify(r), { status: 200 });
  }) as unknown as typeof fetch;
  return { sent, inits, fetchImpl };
}

function auth(session = 'S1'): SessionProvider & { refreshed: number } {
  const a = { cur: session, refreshed: 0, session: () => a.cur, refresh: async () => { a.refreshed++; a.cur = 'S2'; return a.cur; } };
  return a;
}

const ok = (data: unknown, cursor = 10) => ({ ok: true, data, cursor, serverTime: '2026-10-14T10:00:00+03:00' });
const fail = (code: string, message = 'нет', extra: Record<string, unknown> = {}, current: unknown = null) =>
  ({ ok: false, error: { code, message, retryable: false, field: null, ...extra }, current });

const dl = (id: string, status: Deadline['status'] = 'new'): Deadline => ({
  id, version: 3, clientId: 'C-1', what: 'ЄП за III квартал', periodicity: 'quarter', due: '2026-10-20', periodEnd: '2026-09-30', status, closedAt: null,
});

describe('транспорт', () => {
  it('POST text/plain без своих заголовков, тело по контракту', async () => {
    const s = server(ok({}));
    await call({ url: URL_, action: 'auth.me', session: 'S1', fetchImpl: s.fetchImpl });
    expect(s.inits[0]?.method).toBe('POST');
    expect(s.inits[0]?.headers).toEqual({ 'Content-Type': 'text/plain;charset=utf-8' });
    expect(s.inits[0]?.credentials).toBe('omit');
    expect(s.sent[0]).toEqual({ v: 1, action: 'auth.me', payload: {}, session: 'S1' });
  });

  it('обрыв связи → NETWORK, не-JSON → SERVER', async () => {
    const s = server(new TypeError('Failed to fetch'), '<html>Sign in</html>');
    await expect(call({ url: URL_, action: 'x', fetchImpl: s.fetchImpl })).rejects.toMatchObject({ code: 'NETWORK' });
    await expect(call({ url: URL_, action: 'x', fetchImpl: s.fetchImpl })).rejects.toMatchObject({ code: 'SERVER' });
  });

  it('выключатель API: текст «ok» вместо JSON → DISABLED с понятным текстом', async () => {
    const s = server('ok');
    await expect(call({ url: URL_, action: 'sync.snapshot', fetchImpl: s.fetchImpl })).rejects.toMatchObject({ code: 'DISABLED', message: expect.stringContaining('выключена') });
  });

  it('тайм-аут 30 с прерывает запрос → NETWORK', async () => {
    vi.useFakeTimers();
    const fetchImpl = ((_u: unknown, init?: RequestInit) => new Promise((_, rej) => {
      init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
    })) as unknown as typeof fetch;
    const p = call({ url: URL_, action: 'x', fetchImpl });
    const check = expect(p).rejects.toMatchObject({ code: 'NETWORK' });
    await vi.advanceTimersByTimeAsync(30_000);
    await check;
    vi.useRealTimers();
  });
});

describe('живой адаптер: записи', () => {
  it('закрытие срока: requestId, baseVersion, closed + next, notifyAt', async () => {
    const s = server(ok({ closed: dl('D-1', 'done'), next: dl('D-2'), notifyAt: null }, 77));
    const api = new LiveApi(URL_, auth(), s.fetchImpl);
    const r = await api.write({ kind: 'closeDeadline', requestId: 'R1', id: 'D-1', baseVersion: 3 });
    expect(s.sent[0]).toMatchObject({ action: 'deadlines.close', requestId: 'R1', session: 'S1', payload: { id: 'D-1', baseVersion: 3 } });
    expect(r).toMatchObject({ ok: true, cursor: 77, notifyAt: null });
    if (!r.ok) return;
    expect(r.changes.map((c) => [c.entity, c.op, c.id, c.origin])).toEqual([['deadline', 'upsert', 'D-1', 'R1'], ['deadline', 'upsert', 'D-2', 'R1']]);
  });

  it('платёж уходит только с полями контракта (без save, source, version)', async () => {
    const p: Payment = { id: 'R2', version: 0, clientId: 'C-1', kopecks: 150000, period: 'Октябрь 2026', method: 'mono', date: '2026-10-14', source: 'сайт', save: 'saving' };
    const s = server(ok({ payment: { ...p, version: 12, save: undefined } }));
    await new LiveApi(URL_, auth(), s.fetchImpl).write({ kind: 'addPayment', requestId: 'R2', payment: p });
    expect(s.sent[0]?.payload).toEqual({ payment: { id: 'R2', clientId: 'C-1', kopecks: 150000, period: 'Октябрь 2026', method: 'mono', date: '2026-10-14' } });
  });

  it('отмена платежа → delete; конфликт возвращает current', async () => {
    const cur: Payment = { id: 'P-5', version: 9, clientId: 'C-1', kopecks: 100, period: 'x', method: 'bank', date: '2026-10-14', source: 'сайт' };
    const s = server(ok({ cancelled: 'P-5' }), fail('CONFLICT', 'Платёж изменили в таблице', {}, cur));
    const api = new LiveApi(URL_, auth(), s.fetchImpl);
    const a = await api.write({ kind: 'cancelPayment', requestId: 'R3', id: 'P-5', baseVersion: 8 });
    expect(a.ok && a.changes[0]).toMatchObject({ entity: 'payment', op: 'delete', id: 'P-5' });
    const b = await api.write({ kind: 'cancelPayment', requestId: 'R4', id: 'P-5', baseVersion: 8 });
    expect(b).toEqual({ ok: false, code: 'CONFLICT', message: 'Платёж изменили в таблице', current: cur });
  });

  it('новый клиент: пустое → null на сервер, null → строка на сайт, сроки от шаблона', async () => {
    const s = server(ok({ client: { id: 'C-117', version: 5, name: 'Тест', kind: 'fop2', marks: [], employer: false, kved: [], phone: null, keyIssuer: null, keyUntil: null, monthly: [] }, createdDeadlines: [dl('D-9')] }));
    const r = await new LiveApi(URL_, auth(), s.fetchImpl).write({ kind: 'addClient', requestId: 'R5', client: {
      id: 'tmp-1', version: 0, name: 'Тест', kind: 'fop2', marks: [], employer: false, kved: [], phone: '', keyIssuer: '', keyUntil: null, monthly: [],
    } });
    expect(s.sent[0]?.payload).toMatchObject({ client: { phone: null, keyIssuer: null } });
    expect(s.sent[0]?.payload.client).not.toHaveProperty('id');
    expect(r.ok && r.changes.map((c) => c.id)).toEqual(['C-117', 'D-9']);
    expect(r.ok && r.changes[0]?.record).toMatchObject({ phone: '', keyIssuer: '' });
  });

  it('задача уходит с типом', async () => {
    const s = server(ok({ task: { id: 'R6', version: 1, clientId: null, text: 'Позвонить', due: null, type: 'call', priority: 'medium', done: false } }));
    await new LiveApi(URL_, auth(), s.fetchImpl).write({ kind: 'createTask', requestId: 'R6', task: { id: 'R6', version: 1, clientId: null, text: 'Позвонить', due: null, type: 'call', priority: 'medium', done: false } });
    expect(s.sent[0]?.payload).toEqual({ task: { id: 'R6', clientId: null, text: 'Позвонить', due: null, type: 'call', priority: 'medium' } });
  });

  it('ночное обслуживание: код и retryAt доходят до очереди', async () => {
    const s = server(fail('MAINTENANCE', 'Ночное обслуживание', { retryable: true, retryAt: '2026-10-15T04:30:00+03:00' }));
    const r = await new LiveApi(URL_, auth(), s.fetchImpl).write({ kind: 'completeTask', requestId: 'R7', id: 'T-1', done: true });
    expect(r).toEqual({ ok: false, code: 'MAINTENANCE', message: 'Ночное обслуживание', retryAt: '2026-10-15T04:30:00+03:00' });
  });

  it('незнакомый код сервера → SERVER (кнопка «Повторить»)', async () => {
    const s = server(fail('UNSUPPORTED_VERSION', 'Обновите страницу'));
    const r = await new LiveApi(URL_, auth(), s.fetchImpl).write({ kind: 'completeTask', requestId: 'R8', id: 'T-1', done: true });
    expect(r).toMatchObject({ ok: false, code: 'SERVER' });
  });

  it('сеанс истёк → тихий вход и повтор тем же requestId', async () => {
    const s = server(fail('AUTH_EXPIRED', 'истёк'), ok({ task: { id: 'T-1', version: 2 } }));
    const a = auth();
    const r = await new LiveApi(URL_, a, s.fetchImpl).write({ kind: 'completeTask', requestId: 'R9', id: 'T-1', done: true });
    expect(r.ok).toBe(true);
    expect(a.refreshed).toBe(1);
    expect(s.sent.map((x) => [x.session, x.requestId])).toEqual([['S1', 'R9'], ['S2', 'R9']]);
  });
  it('ответ на вопрос: questions.answer, вопрос с ответом приходит изменением; «уже отвечен» — с current', async () => {
    const q = { id: 'Q-1', version: 4, text: 'Добавить КВЕД?', type: 'choice', options: ['Да', 'Нет'], clientId: 'C-1', status: 'asked', askedAt: '2026-10-14T10:00', answer: 'Да' };
    const s = server(ok({ question: q }, 21), fail('VALIDATION', 'Уже ответили в Telegram: Нет', {}, { ...q, answer: 'Нет' }));
    const api = new LiveApi(URL_, auth(), s.fetchImpl);
    const a = await api.write({ kind: 'answerQuestion', requestId: 'R10', id: 'Q-1', text: 'Да' });
    expect(s.sent[0]).toMatchObject({ action: 'questions.answer', requestId: 'R10', payload: { id: 'Q-1', text: 'Да' } });
    expect(a.ok && a.changes[0]).toMatchObject({ entity: 'question', op: 'upsert', id: 'Q-1', origin: 'R10' });
    const b = await api.write({ kind: 'answerQuestion', requestId: 'R11', id: 'Q-1', text: 'Да' });
    expect(b).toMatchObject({ ok: false, code: 'VALIDATION', current: { id: 'Q-1', answer: 'Нет' } });
  });
});

describe('живой адаптер: новые действия (очередь 15.10)', () => {
  it('срок: deadlines.update с baseVersion и patch; ответ — upsert срока', async () => {
    const s = server(ok({ deadline: { ...dl('D-3'), status: 'postponed', due: '2026-11-01', version: 9 } }, 30));
    const r = await new LiveApi(URL_, auth(), s.fetchImpl).write({ kind: 'updateDeadline', requestId: 'R20', id: 'D-3', baseVersion: 3, patch: { status: 'postponed', due: '2026-11-01' } });
    expect(s.sent[0]).toMatchObject({ action: 'deadlines.update', requestId: 'R20', payload: { id: 'D-3', baseVersion: 3, patch: { status: 'postponed', due: '2026-11-01' } } });
    expect(r.ok && r.changes[0]).toMatchObject({ entity: 'deadline', id: 'D-3', record: { status: 'postponed' } });
  });

  it('платежи месяца: payments.list { month } без requestId', async () => {
    const s = server(ok({ payments: [], totalKopecks: 0 }));
    const r = await new LiveApi(URL_, auth(), s.fetchImpl).listPayments('2026-06');
    expect(s.sent[0]).toEqual({ v: 1, action: 'payments.list', payload: { month: '2026-06' }, session: 'S1' });
    expect(r.totalKopecks).toBe(0);
  });

  it('вопросы: questions.list', async () => {
    const s = server(ok({ questions: [{ id: 'Q-9' }] }));
    const r = await new LiveApi(URL_, auth(), s.fetchImpl).listQuestions();
    expect(s.sent[0]?.action).toBe('questions.list');
    expect(r.map((q) => q.id)).toEqual(['Q-9']);
  });
});

describe('живой адаптер: «Входящие»', () => {
  it('inbox.decide: сумма передаётся, в ответе — сообщение и созданный платёж', async () => {
    const it0 = { id: 'IN-1', at: '2026-10-15T09:00', clientId: 'C-1', clientName: 'Тест', type: 'payment', snippet: '1200', amount: 120000, status: 'accepted' };
    const pay = { id: 'R30', version: 5, clientId: 'C-1', kopecks: 125000, period: 'x', method: 'bank', date: '2026-10-15', source: 'сайт' };
    const s = server(ok({ inbox: it0, payment: pay, task: null }, 40));
    const r = await new LiveApi(URL_, auth(), s.fetchImpl).write({ kind: 'decideInbox', requestId: 'R30', id: 'IN-1', action: 'accept', amount: 125000 });
    expect(s.sent[0]).toMatchObject({ action: 'inbox.decide', requestId: 'R30', payload: { id: 'IN-1', action: 'accept', amount: 125000 } });
    expect(r.ok && r.changes.map((c) => `${c.entity}:${c.id}`)).toEqual(['inbox:IN-1', 'payment:R30']);
  });

  it('без суммы поле amount не отправляется', async () => {
    const s = server(ok({ inbox: { id: 'IN-2', status: 'rejected' } }));
    await new LiveApi(URL_, auth(), s.fetchImpl).write({ kind: 'decideInbox', requestId: 'R31', id: 'IN-2', action: 'reject' });
    expect(s.sent[0]?.payload).toEqual({ id: 'IN-2', action: 'reject' });
  });
});

describe('живой адаптер: чтение', () => {
  it('изменения страницами до hasMore=false; незнакомую сущность пропускаем', async () => {
    const s = server(
      ok({ changes: [{ rev: 11, entity: 'payment', op: 'upsert', id: 'P-1', origin: 'таблица', record: { id: 'P-1' } }, { rev: 12, entity: 'secret', op: 'upsert', id: 'X-1', origin: 'таблица', record: {} }], cursor: 12, hasMore: true }),
      ok({ changes: [{ rev: 13, entity: 'deadline', op: 'delete', id: 'D-1', origin: 'таблица' }], cursor: 13, hasMore: false }),
    );
    const r = await new LiveApi(URL_, auth(), s.fetchImpl).changesSince(10);
    expect(s.sent.map((x) => x.payload)).toEqual([{ since: 10, limit: 500 }, { since: 12, limit: 500 }]);
    expect(r.cursor).toBe(13);
    expect(r.changes.map((c) => `${c.cursor}:${c.entity}:${c.op}`)).toEqual(['11:payment:upsert', '13:deadline:delete']);
  });

  it('снимок: срок без клиента (clientId: null) и клиент без типа (kind: null) не ломают разбор', async () => {
    const s = server(ok({ clients: [{ id: 'C-1', version: 1, name: 'Без типа', kind: null, marks: [], employer: false, kved: [], phone: null, keyIssuer: null, keyUntil: null, monthly: [] }],
      deadlines: [{ ...dl('D-1'), clientId: null }], payments: [], tasks: [], activity: [], cursor: 5 }));
    const snap = await new LiveApi(URL_, auth(), s.fetchImpl).snapshot();
    expect(snap.clients[0]).toMatchObject({ kind: null, phone: '' });
    expect(snap.deadlines[0]?.clientId).toBe('');
    expect(snap.questions).toEqual([]);
  });

  it('пустые поля таблицы доходят как null: дата срока, сумма платежа, дата вопроса', async () => {
    const s = server(ok({ clients: [], deadlines: [{ ...dl('D-2'), due: null }],
      payments: [{ id: 'P-1', version: 1, clientId: 'C-1', kopecks: null, period: 'x', method: 'cash', date: '2026-10-11', source: 'таблица', status: 'expected' }],
      tasks: [], activity: [], questions: [{ id: 'Q-2', version: 1, text: '?', type: 'text', options: [], clientId: null, status: 'waiting', askedAt: null, answer: null }], cursor: 6 }));
    const snap = await new LiveApi(URL_, auth(), s.fetchImpl).snapshot();
    expect([snap.deadlines[0]?.due, snap.payments[0]?.kopecks, snap.questions[0]?.askedAt]).toEqual([null, null, null]);
  });

  it('CURSOR_EXPIRED уходит наверх как ApiError', async () => {
    const s = server(fail('CURSOR_EXPIRED', 'старый курсор'));
    await expect(new LiveApi(URL_, auth(), s.fetchImpl).changesSince(1)).rejects.toBeInstanceOf(ApiError);
  });

  it('пароль: отдельный запрос с confirm, без requestId', async () => {
    const s = server(ok({ login: 'l', password: 'p', ttlSeconds: 30 }));
    const r = await new LiveApi(URL_, auth(), s.fetchImpl).revealPassword('C-1');
    expect(s.sent[0]).toEqual({ v: 1, action: 'clients.revealPassword', payload: { id: 'C-1', confirm: true }, session: 'S1' });
    expect(r.ttlSeconds).toBe(30);
  });

  it('платёж с пустыми клетками: дата и сумма → null, способ → «другое» (снимок, изменения, payments.list)', async () => {
    const raw = { id: 'P-1', version: 1, clientId: null, kopecks: '', period: null, method: '', date: '', source: 'таблица' };
    const s = server(ok({ clients: [], deadlines: [], payments: [raw], tasks: [], activity: [], cursor: 1 }), ok({ payments: [raw], totalKopecks: 0 }));
    const api = new LiveApi(URL_, auth(), s.fetchImpl);
    const want = { date: null, kopecks: null, method: 'other', period: '', clientId: '' };
    expect((await api.snapshot()).payments[0]).toMatchObject(want);
    expect((await api.listPayments('2026-10')).payments[0]).toMatchObject(want);
  });

  it('справочник: reference.rates — числа как есть, пустые клетки → null; группа строкой → число', async () => {
    const s = server(ok({ year: 2026, mzpKopecks: 864700, pmKopecks: '', esvMonthlyKopecks: 190234, esvRatePct: 22,
      groups: [{ group: '2', limitKopecks: 721159800, limitMzp: 834, epRule: '20 % МЗП' }, { group: null }], updatedAt: '2026-01-02',
      source: 'fallback', limitsSource: 'code' }));
    const r = await new LiveApi(URL_, auth(), s.fetchImpl).referenceRates();
    expect(s.sent[0]).toEqual({ v: 1, action: 'reference.rates', payload: {}, session: 'S1' });
    expect(r).toMatchObject({ year: 2026, mzpKopecks: 864700, pmKopecks: null, esvRatePct: 22, source: 'fallback', limitsSource: 'code' });
    expect(r.groups).toEqual([{ group: 2, limitKopecks: 721159800, limitMzp: 834, epRule: '20 % МЗП' }]);
  });

  it('справочник: reference.kved { q } — до 20 строк, решение горсовета пустое → null', async () => {
    const s = server(ok({ items: [{ code: '56.30', title: 'Обслуговування напоями', epByGroup: { 2: '20 % МЗП', 3: null }, councilDecision: '' }, { title: 'без кода' }] }));
    const r = await new LiveApi(URL_, auth(), s.fetchImpl).referenceKved('56.3');
    expect(s.sent[0]?.payload).toEqual({ q: '56.3' });
    expect(r).toEqual({ items: [{ code: '56.30', title: 'Обслуговування напоями', epByGroup: { '2': '20 % МЗП' }, councilDecision: null }], note: null });
  });

  it('справочник: не нашлось — items пуст и пояснение сервера (note)', async () => {
    const s = server(ok({ items: [], note: 'не установлена радою', matchedBy: null }));
    expect(await new LiveApi(URL_, auth(), s.fetchImpl).referenceKved('99.99')).toEqual({ items: [], note: 'не установлена радою' });
  });

  it('карточка: clients.get { id } — клиент, сроки, платежи, задачи, история; пустые клетки нормализуются', async () => {
    const s = server(ok({
      client: { id: 'C-1', name: 'К', kind: 'fop2', phone: null, keyIssuer: null, version: 4 },
      deadlines: [{ ...dl('D-1'), clientId: null }], payments: [{ id: 'P-1', date: '', kopecks: '', method: 'x' }],
      tasks: [{ id: 'T-1', text: null }], history: [{ id: 'A-1', when: null, text: 'Изменён телефон', source: 'сайт' }],
    }));
    const r = await new LiveApi(URL_, auth(), s.fetchImpl).clientCard('C-1');
    expect(s.sent[0]).toEqual({ v: 1, action: 'clients.get', payload: { id: 'C-1' }, session: 'S1' });
    expect(r.client).toMatchObject({ id: 'C-1', phone: '', keyIssuer: '', marks: [], kved: [], monthly: [] });
    expect(r.deadlines[0]?.clientId).toBe('');
    expect(r.payments[0]).toMatchObject({ date: null, kopecks: null, method: 'other' });
    expect(r.tasks[0]?.text).toBe('');
    expect(r.history[0]).toMatchObject({ when: '', text: 'Изменён телефон' });
  });

  it('закрыть несколько: deadlines.closeMany — закрытые в changes, отказы в failed; молчание по сроку — тоже отказ', async () => {
    const s = server(ok({ results: [
      { id: 'D-1', ok: true, closed: { ...dl('D-1', 'done'), version: 5 }, next: dl('D-9') },
      { id: 'D-2', ok: false, error: { code: 'PERIOD_OPEN', message: 'Период ещё не закончился', detail: null, retryable: false, field: null, retryAt: null }, current: null },
      { id: 'D-3', ok: false, error: { code: 'CONFLICT', message: 'Срок изменился', detail: null, retryable: false, field: null, retryAt: null }, current: { ...dl('D-3'), version: 8 } },
    ], closed: 1, failed: 2 }, 40));
    const r = await new LiveApi(URL_, auth(), s.fetchImpl).write({ kind: 'closeDeadlines', requestId: 'B1',
      items: [{ id: 'D-1', baseVersion: 3 }, { id: 'D-2', baseVersion: 3 }, { id: 'D-3', baseVersion: 3 }, { id: 'D-4', baseVersion: 3 }] });
    expect(s.sent[0]).toMatchObject({ action: 'deadlines.closeMany', requestId: 'B1', payload: { items: [{ id: 'D-1', baseVersion: 3 }, { id: 'D-2', baseVersion: 3 }, { id: 'D-3', baseVersion: 3 }, { id: 'D-4', baseVersion: 3 }] } });
    expect(r.ok && r.changes.map((c) => c.id)).toEqual(['D-1', 'D-9']);
    expect(r.ok && r.nextOf).toEqual({ 'D-1': 'D-9' });
    expect(r.ok && r.failed?.map((f) => [f.id, f.code, f.current?.version ?? null])).toEqual([['D-2', 'PERIOD_OPEN', null], ['D-3', 'CONFLICT', 8], ['D-4', 'SERVER', null]]);
  });

  it('задачи: tasks.update { id, baseVersion, patch } → upsert; tasks.delete → delete', async () => {
    const s = server(ok({ task: { id: 'T-1', text: 'Позвонить', due: null, version: 6 } }, 50), ok({ deleted: 'T-2' }, 51));
    const api = new LiveApi(URL_, auth(), s.fetchImpl);
    const r1 = await api.write({ kind: 'updateTask', requestId: 'R1', id: 'T-1', baseVersion: 5, patch: { text: 'Позвонить', due: null } });
    expect(s.sent[0]).toMatchObject({ action: 'tasks.update', requestId: 'R1', payload: { id: 'T-1', baseVersion: 5, patch: { text: 'Позвонить', due: null } } });
    expect(r1.ok && r1.changes[0]).toMatchObject({ entity: 'task', op: 'upsert', id: 'T-1' });
    const r2 = await api.write({ kind: 'deleteTask', requestId: 'R2', id: 'T-2', baseVersion: 3 });
    expect(s.sent[1]).toMatchObject({ action: 'tasks.delete', payload: { id: 'T-2', baseVersion: 3 } });
    expect(r2.ok && r2.changes[0]).toMatchObject({ entity: 'task', op: 'delete', id: 'T-2' });
  });

  it('напомнить: clients.remind с requestId — ушло / нет бота / RATE_LIMIT с retryAt', async () => {
    const s = server(
      ok({ sent: true, sentAt: '2026-10-15T19:00:00+03:00', preview: 'Добрий день!' }),
      ok({ sent: false, reason: 'noBot', message: 'У клієнта немає бота' }),
      fail('RATE_LIMIT', 'Вже нагадували', { retryable: true, retryAt: '2026-10-16T07:00:00+03:00' }),
    );
    const api = new LiveApi(URL_, auth(), s.fetchImpl);
    const req = { clientId: 'C-1', kind: 'deadline' as const, deadlineId: 'D-1', text: 'Добрий день!' };
    expect(await api.remindClient(req, 'R1')).toEqual({ sent: true, sentAt: '2026-10-15T19:00:00+03:00', preview: 'Добрий день!' });
    expect(s.sent[0]).toMatchObject({ action: 'clients.remind', requestId: 'R1', payload: { clientId: 'C-1', kind: 'deadline', deadlineId: 'D-1', text: 'Добрий день!' } });
    expect(await api.remindClient(req, 'R2')).toEqual({ sent: false, reason: 'noBot', message: 'У клієнта немає бота' });
    expect(await api.remindClient(req, 'R3')).toEqual({ sent: false, reason: 'rateLimit', message: 'Вже нагадували', retryAt: '2026-10-16T07:00:00+03:00' });
  });

  it('пробный запуск напоминания: clients.remind { preview:true } без requestId — текст и язык', async () => {
    const s = server(ok({ preview: 'Добрий день! 📅 Нагадую…', lang: 'uk' }));
    const r = await new LiveApi(URL_, auth(), s.fetchImpl).remindPreview({ clientId: 'C-1', kind: 'deadline', deadlineId: 'D-1' });
    expect(s.sent[0]).toEqual({ v: 1, action: 'clients.remind', payload: { clientId: 'C-1', kind: 'deadline', preview: true, deadlineId: 'D-1' }, session: 'S1' });
    expect(r).toEqual({ preview: 'Добрий день! 📅 Нагадую…', lang: 'uk', reason: null, message: null });
  });

  it('пробный прогон: нет бота — preview null и причина (окно скажет сразу)', async () => {
    const s = server(ok({ preview: null, lang: 'uk', reason: 'noBot', message: 'У клієнта немає бота' }));
    expect(await new LiveApi(URL_, auth(), s.fetchImpl).remindPreview({ clientId: 'C-1', kind: 'key' }))
      .toEqual({ preview: null, lang: 'uk', reason: 'noBot', message: 'У клієнта немає бота' });
  });

  it('входящие v5.72: file и taxKopecks из снимка; taxTask уходит действием; «уже решено» — CONFLICT с current', async () => {
    const item = { id: 'I-1', version: 2, at: '2026-10-15T21:00:00+03:00', clientId: 'C-1', clientName: 'К', type: 'payment', snippet: 'Сплатила 1200 і податок', amount: 120000, status: 'new', file: true, taxKopecks: 34500 };
    const s = server(
      ok({ clients: [], deadlines: [], payments: [], tasks: [], activity: [], inbox: [item, { ...item, id: 'I-2', file: 'так', taxKopecks: '' }], cursor: 1 }),
      ok({ inbox: item, payment: null, task: { id: 'T-9', text: 'Налог' } }, 5),
      fail('CONFLICT', 'Уже решено', {}, { ...item, status: 'accepted' }),
    );
    const api = new LiveApi(URL_, auth(), s.fetchImpl);
    const snap = await api.snapshot();
    expect(snap.inbox.map((x) => [x.file, x.taxKopecks])).toEqual([[true, 34500], [false, null]]);
    const r = await api.write({ kind: 'decideInbox', requestId: 'R1', id: 'I-1', action: 'taxTask' });
    expect(s.sent[1]).toMatchObject({ action: 'inbox.decide', requestId: 'R1', payload: { id: 'I-1', action: 'taxTask' } });
    expect(r.ok && r.changes.map((c) => c.entity)).toEqual(['inbox', 'task']);
    const c = await api.write({ kind: 'decideInbox', requestId: 'R2', id: 'I-1', action: 'accept' });
    expect(!c.ok && [c.code, c.current && 'status' in c.current ? c.current.status : null]).toEqual(['CONFLICT', 'accepted']);
  });
  it('консультации v5.87: снимок и карточка нормализуются; skipped — флаг; create шлёт только заполненное', async () => {
    const raw = { id: 'K-1', version: 2, clientId: 'C-1', at: '', topic: 'Третья группа', minutes: 15.5, note: null };
    const s = server(
      ok({ clients: [], deadlines: [], payments: [], tasks: [], activity: [], consultations: [raw], consultationsSkipped: true, cursor: 1 }),
      ok({ consultation: { ...raw, id: 'K-2', at: '2026-10-16T21:00:00+03:00', minutes: 20, note: 'ок' } }, 7),
    );
    const api = new LiveApi(URL_, auth(), s.fetchImpl);
    const snap = await api.snapshot();
    expect(snap.consultations).toEqual([{ id: 'K-1', version: 2, clientId: 'C-1', at: null, topic: 'Третья группа', minutes: null, note: '' }]);
    expect(snap.consultationsSkipped).toBe(true);
    const r = await api.write({ kind: 'createConsultation', requestId: 'R5', consultation: { id: 'R5', version: 0, clientId: 'C-1', at: null, topic: 'Тема', minutes: null, note: '' } });
    expect(s.sent[1]).toMatchObject({ action: 'consultations.create', requestId: 'R5', payload: { clientId: 'C-1', topic: 'Тема' } });
    expect(Object.keys((s.sent[1] as { payload: object }).payload)).toEqual(['clientId', 'topic']);
    expect(r.ok && r.changes.map((c) => [c.entity, c.id, (c.record as { minutes: number }).minutes])).toEqual([['consultation', 'K-2', 20]]);
  });

  it('главный КВЕД: kvedMain / kvedMainNote из снимка; пусто или нет поля — null', async () => {
    const base = { version: 1, name: 'К', kind: 'fop2', marks: [], employer: false, kved: [{ code: '47.11', title: 'т' }, { code: '56.10', title: 'р' }], phone: null, keyIssuer: null, keyUntil: null, monthly: [] };
    const s = server(ok({ clients: [{ ...base, id: 'C-1', kvedMain: '56.10', kvedMainNote: 'max ставка' }, { ...base, id: 'C-2', kvedMain: '' }, { ...base, id: 'C-3' }],
      deadlines: [], payments: [], tasks: [], activity: [], cursor: 1 }));
    const snap = await new LiveApi(URL_, auth(), s.fetchImpl).snapshot();
    expect(snap.clients.map((c) => [c.kvedMain, c.kvedMainNote])).toEqual([['56.10', 'max ставка'], [null, null], [null, null]]);
  });

  it('deadlines.create v5.88: создан; CONFLICT с открытым сроком; VALIDATION с полем; нет связи — бросает (повтор тем же requestId)', async () => {
    const dl = { id: 'R7', version: 1, clientId: 'C-1', what: 'ЄП за IV квартал', periodicity: 'quarter', due: '2027-02-09', periodEnd: '2026-12-31', status: 'new', closedAt: null };
    const s = server(
      ok({ deadline: dl }, 9),
      fail('CONFLICT', 'Уже есть открытый срок', { field: 'obligation' }, { ...dl, id: 'D-3' }),
      fail('VALIDATION', 'Дата — ГГГГ-ММ-ДД', { field: 'due' }),
    );
    const api = new LiveApi(URL_, auth(), s.fetchImpl);
    const input = { clientId: 'C-1', obligation: 'ЄП за IV квартал', due: '2027-02-09', periodicity: 'quarter' as const, note: '' };
    expect(await api.createDeadline(input, 'R7')).toEqual({ ok: true, deadline: dl });
    expect(s.sent[0]).toMatchObject({ action: 'deadlines.create', requestId: 'R7', payload: { deadline: { id: 'R7', clientId: 'C-1', obligation: 'ЄП за IV квартал', due: '2027-02-09', periodicity: 'quarter' } } });
    expect(Object.keys((s.sent[0] as unknown as { payload: { deadline: object } }).payload.deadline)).not.toContain('note');
    const c = await api.createDeadline(input, 'R8');
    expect(!c.ok && [c.code, c.field, c.current?.id]).toEqual(['CONFLICT', 'obligation', 'D-3']);
    const v = await api.createDeadline({ ...input, due: '9.2.27' }, 'R9');
    expect(!v.ok && [v.code, v.field, v.current]).toEqual(['VALIDATION', 'due', null]);
    const down = new LiveApi(URL_, auth(), (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch);
    await expect(down.createDeadline(input, 'R10')).rejects.toBeTruthy();
  });

  it('deadlines.applyTemplate: пробный прогон без requestId; запись с ним; «нет системы» — VALIDATION template', async () => {
    const added = { id: 'D-9', version: 1, clientId: 'C-1', what: 'ЄП за IV квартал', periodicity: 'quarter', due: '2027-02-19', periodEnd: '2026-12-31', status: 'new', closedAt: null };
    const s = server(
      ok({ template: 'FOP3', wouldAdd: [{ obligation: 'ЄП за IV квартал', periodicity: 'quarter', due: '2027-02-19' }], skipped: ['ЄСВ за IV квартал'] }),
      ok({ template: 'FOP3', added: [added], skipped: ['ЄСВ за IV квартал'] }, 12),
      fail('VALIDATION', 'У клиента не указана система — выберите шаблон', { field: 'template' }),
    );
    const api = new LiveApi(URL_, auth(), s.fetchImpl);
    expect(await api.previewTemplate('C-1')).toEqual({ template: 'FOP3', wouldAdd: [{ obligation: 'ЄП за IV квартал', periodicity: 'quarter', due: '2027-02-19' }], skipped: ['ЄСВ за IV квартал'] });
    expect(s.sent[0]).toMatchObject({ action: 'deadlines.applyTemplate', payload: { clientId: 'C-1', dryRun: true } });
    expect(s.sent[0]?.requestId).toBeUndefined();
    const r = await api.applyTemplate('C-1', undefined, 'R4');
    expect(s.sent[1]).toMatchObject({ action: 'deadlines.applyTemplate', requestId: 'R4', payload: { clientId: 'C-1' } });
    expect(Object.keys((s.sent[1] as unknown as { payload: object }).payload)).toEqual(['clientId']);
    expect(r.ok && [r.template, r.added.map((d) => d.id), r.skipped]).toEqual(['FOP3', ['D-9'], ['ЄСВ за IV квартал']]);
    expect(await api.previewTemplate('C-2', 'EXCISE')).toEqual({ ok: false, code: 'VALIDATION', message: 'У клиента не указана система — выберите шаблон', field: 'template' });
    expect(s.sent[2]).toMatchObject({ payload: { clientId: 'C-2', template: 'EXCISE', dryRun: true } });
  });

  it('clients.botLink: без requestId; не подключён — ссылка и срок; подключён — ссылки нет', async () => {
    const s = server(
      ok({ clientId: 'C-1', connected: false, link: 'https://t.me/za_control_bot?start=client_abc', expiresAt: '2026-10-23T21:00:00+03:00' }),
      ok({ clientId: 'C-2', connected: true, link: null, expiresAt: null }),
    );
    const api = new LiveApi(URL_, auth(), s.fetchImpl);
    expect(await api.clientBotLink('C-1')).toEqual({ connected: false, link: 'https://t.me/za_control_bot?start=client_abc', expiresAt: '2026-10-23T21:00:00+03:00' });
    expect(s.sent[0]).toMatchObject({ action: 'clients.botLink', payload: { clientId: 'C-1' } });
    expect(s.sent[0]?.requestId).toBeUndefined();
    expect(await api.clientBotLink('C-2')).toEqual({ connected: true, link: null, expiresAt: null });
  });

  it('выписка: PDF без requestId (не https — ошибка); превью; отправка с requestId; лимит 12 ч — RATE_LIMIT с retryAt', async () => {
    const s = server(
      ok({ clientId: 'C-1', url: 'https://drive.google.com/file/d/x', fileName: 'Виписка.pdf', fileId: 'x' }),
      ok({ clientId: 'C-1', url: 'javascript:alert(1)', fileName: 'x' }),
      ok({ preview: 'Ваша виписка', lang: 'uk' }),
      ok({ sent: true, sentAt: '2026-10-16T16:00:00+03:00', preview: 'Ваша виписка', url: 'https://drive.google.com/file/d/y' }),
      { ok: false, error: { code: 'RATE_LIMIT', message: 'Уже писали', retryable: false, field: null, retryAt: '2026-10-17T04:00:00+03:00' }, current: null },
    );
    const api = new LiveApi(URL_, auth(), s.fetchImpl);
    expect(await api.statementPdf('C-1')).toEqual({ url: 'https://drive.google.com/file/d/x', fileName: 'Виписка.pdf' });
    expect(s.sent[0]?.requestId).toBeUndefined();
    await expect(api.statementPdf('C-1')).rejects.toThrow('ссылку');
    expect(await api.statementPreview('C-1')).toEqual({ preview: 'Ваша виписка', reason: null, message: null });
    expect(s.sent[2]).toMatchObject({ action: 'clients.sendStatement', payload: { clientId: 'C-1', preview: true } });
    expect(await api.sendStatement('C-1', 'R1')).toEqual({ sent: true, sentAt: '2026-10-16T16:00:00+03:00', preview: 'Ваша виписка' });
    expect(s.sent[3]).toMatchObject({ action: 'clients.sendStatement', requestId: 'R1', payload: { clientId: 'C-1' } });
    expect(await api.sendStatement('C-1', 'R2')).toEqual({ sent: false, reason: 'rateLimit', message: 'Уже писали', retryAt: '2026-10-17T04:00:00+03:00' });
  });

  it('«Не писать клиенту»: снято / снимать нечего / уже ушло (CONFLICT с sentAt); requestId — свой на нажатие', async () => {
    const s = server(ok({ id: 'D-1', cancelled: true }), ok({ id: 'D-1', cancelled: false }), fail('CONFLICT', 'Уже отправлено', {}, { id: 'D-1', sentAt: '2026-10-16T02:10:00+03:00' }));
    const api = new LiveApi(URL_, auth(), s.fetchImpl);
    expect(await api.cancelNotify('D-1', 'R1')).toEqual({ status: 'cancelled' });
    expect(s.sent[0]).toMatchObject({ action: 'deadlines.cancelNotify', requestId: 'R1', payload: { id: 'D-1' } });
    expect(await api.cancelNotify('D-1', 'R2')).toEqual({ status: 'nothing' });
    expect(await api.cancelNotify('D-1', 'R3')).toEqual({ status: 'sent', sentAt: '2026-10-16T02:10:00+03:00' });
  });

  it('входящие 16.10: order / voice / tax читаются как есть; незнакомый тип — как вопрос (экран не падает)', async () => {
    const base = { version: 1, at: '2026-10-16T09:00', clientId: 'C-1', clientName: 'К', snippet: '…', amount: null, status: 'new' };
    const s = server(ok({ clients: [], deadlines: [], payments: [], tasks: [], activity: [], cursor: 1,
      inbox: ['order', 'voice', 'tax', 'sticker'].map((type, n) => ({ ...base, id: `I-${n}`, type })) }));
    const snap = await new LiveApi(URL_, auth(), s.fetchImpl).snapshot();
    expect(snap.inbox.map((x) => x.type)).toEqual(['order', 'voice', 'tax', 'question']);
  });
});
