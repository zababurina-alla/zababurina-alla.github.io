// Живой адаптер: тот же CabinetApi, что у выдуманного сервера, но поверх JSON-API Apps Script
// (docs/api-contract.md v2.1). Экраны и очередь записей не знают, с кем говорят.
import { ApiError, call } from './transport';
import type { Envelope } from './transport';
import type { ApplyTemplateResult, ArchivedDeadline, ArchivePage, AttentionItem, MonthCheck, MonthItem, MonthSheet, BotLinkResult, CabinetApi, StatementPdf, StatementPreview, StatementResult, CancelNotifyResult, Change, CreateDeadlineResult, DeadlineTemplate, NewDeadline, ClientCard, Entity, ErrorCode, KvedAll, KvedFound, RemindPreview, RemindRequest, RemindResult, Snapshot, WriteOp, WriteResult } from './api';
import { MONTH_CHECKS, RETRYABLE } from './api';
import type { Activity, Client, Consultation, Deadline, InboxItem, InboxType, KvedItem, Payment, Question, RateGroup, Rates, Task } from './types';
import { INBOX_TYPES } from './types';

/** Пауза перед повтором — отдельно, чтобы тесты не ждали секунды. */
export const pause = { sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) };

/** Откуда брать сеанс и как тихо войти заново (auth.ts). */
export interface SessionProvider {
  session(): string | null;
  /** Тихий повторный вход (auto_select). Не вышло — бросает ApiError AUTH_REQUIRED. */
  refresh(): Promise<string>;
}

export interface DiagCounters {
  received: number;
  applied: number;
  rejectedByCode: Record<string, number>;
  repeats: number;
  changelogRev?: number;
}

interface ServerChange { rev: number; entity: string; op: 'upsert' | 'delete'; id: string; origin: string; record?: unknown }

const ENTITIES: ReadonlySet<string> = new Set<Entity>(['client', 'deadline', 'payment', 'activity', 'task', 'question', 'inbox', 'consultation']);
const SITE_CODES: ReadonlySet<string> = new Set<ErrorCode>(['NETWORK', 'CONFLICT', 'PERIOD_OPEN', 'NOT_FOUND', 'SERVER', 'VALIDATION',
  'UNDO_TOO_LATE', 'DUPLICATE', 'BUSY', 'MAINTENANCE', 'QUOTA', 'RATE_LIMIT', 'AUTH_EXPIRED', 'AUTH_REQUIRED', 'FORBIDDEN']);
const MAX_PAGES = 20;

// Сервер отдаёт пустое как null (контракт, раздел 2); экраны сайта ждут строку.
function normClient(raw: unknown): Client {
  const c = raw as Client & { phone: string | null; keyIssuer: string | null };
  const main = text((raw as { kvedMain?: unknown }).kvedMain).trim();
  const note = text((raw as { kvedMainNote?: unknown }).kvedMainNote).trim();
  return { ...c, name: c.name ?? '', phone: c.phone ?? '', keyIssuer: c.keyIssuer ?? '', marks: c.marks ?? [], kved: c.kved ?? [], monthly: c.monthly ?? [],
    kvedMain: main || null, kvedMainNote: note || null, ...clientExtras(raw as Record<string, unknown>) };
}

const METHODS: ReadonlySet<string> = new Set(['bank', 'cash', 'mono', 'diia', 'transfer', 'other']);

// Платёж с пустыми клетками листа: дата '' → null (группа «Без даты»), сумма не число → null, способ не из списка → «другое».
export function normPayment(raw: unknown): Payment {
  const p = raw as Payment & { date: unknown; kopecks: unknown; period: unknown; method: unknown; clientId: unknown };
  return {
    ...p,
    clientId: typeof p.clientId === 'string' ? p.clientId : '',
    date: typeof p.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(p.date) ? p.date.slice(0, 10) : null,
    kopecks: typeof p.kopecks === 'number' && Number.isFinite(p.kopecks) ? p.kopecks : null,
    period: typeof p.period === 'string' ? p.period : '',
    method: typeof p.method === 'string' && METHODS.has(p.method) ? p.method as Payment['method'] : 'other',
  };
}

// Справочник: пустая клетка листа приходит null или строкой — на экране «—», а не NaN и не выдуманная цифра.
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const text = (x: unknown): string => (typeof x === 'string' ? x : typeof x === 'number' ? String(x) : '');

export function normRates(raw: unknown): Rates {
  const r = (raw ?? {}) as Record<string, unknown>;
  const groups = Array.isArray(r.groups) ? r.groups : [];
  return {
    year: num(r.year) ?? 0,
    mzpKopecks: num(r.mzpKopecks), pmKopecks: num(r.pmKopecks), esvMonthlyKopecks: num(r.esvMonthlyKopecks), esvRatePct: num(r.esvRatePct),
    groups: groups.map((g): RateGroup => {
      const o = (g ?? {}) as Record<string, unknown>;
      return { group: num(o.group) ?? (typeof o.group === 'string' && o.group.trim() ? Number(o.group) : NaN), limitKopecks: num(o.limitKopecks), limitMzp: num(o.limitMzp), epRule: text(o.epRule) };
    }).filter((g) => Number.isFinite(g.group)),
    updatedAt: typeof r.updatedAt === 'string' && r.updatedAt ? r.updatedAt : null,
    source: text(r.source), limitsSource: text(r.limitsSource),
  };
}

export function normKved(raw: unknown): KvedItem {
  const k = (raw ?? {}) as Record<string, unknown>;
  const ep: Record<string, string> = {};
  if (k.epByGroup && typeof k.epByGroup === 'object') {
    for (const [g, v] of Object.entries(k.epByGroup as Record<string, unknown>)) if (text(v)) ep[g] = text(v);
  }
  return { code: text(k.code), title: text(k.title), epByGroup: ep, councilDecision: text(k.councilDecision) || null };
}

/** Поля клиента v5.88: доход (целое, копейки) и его основа, банк, язык бота; непонятное — null. */
function clientExtras(r: Record<string, unknown>): Pick<Client, 'incomeKopecks' | 'incomeBasis' | 'bank' | 'lang'> {
  const inc = num(r.incomeKopecks);
  return {
    incomeKopecks: inc !== null && Number.isInteger(inc) ? inc : null,
    incomeBasis: r.incomeBasis === 'quarterTurnover' || r.incomeBasis === 'yearProfit' ? r.incomeBasis : null,
    bank: text(r.bank).trim() || null,
    lang: r.lang === 'uk' || r.lang === 'ru' ? r.lang : null,
  };
}

/** Консультация: пустая дата → null, минуты — только целое, тема и заметка — строки. */
function normConsultation(raw: unknown): Consultation {
  const r = raw as Record<string, unknown>;
  const m = num(r.minutes);
  return { id: text(r.id), version: num(r.version) ?? 0, clientId: text(r.clientId), at: text(r.at) || null,
    topic: text(r.topic), minutes: m !== null && Number.isInteger(m) ? m : null, note: text(r.note) };
}

function normRecord(entity: Entity, raw: unknown): NonNullable<Change['record']> {
  if (entity === 'client') return normClient(raw);
  if (entity === 'consultation') return normConsultation(raw);
  if (entity === 'payment') return normPayment(raw);
  // Срок, чьего клиента нет в «Клиентах», сервер отдаёт с clientId: null.
  if (entity === 'deadline') { const d = raw as Deadline & { clientId: string | null }; return { ...d, clientId: d.clientId ?? '' }; }
  // Строки, которые экраны режут и сравнивают (when.slice, at.localeCompare): пустая клетка → '' вместо null.
  if (entity === 'activity') { const a = raw as Activity; return { ...a, when: a.when ?? '', text: a.text ?? '' }; }
  if (entity === 'task') { const t = raw as Task; return { ...t, text: t.text ?? '' }; }
  if (entity === 'inbox') {
    const i = raw as InboxItem & { file?: unknown; taxKopecks?: unknown; amount?: unknown };
    const iso = (x: unknown) => (typeof x === 'string' && x ? x : null);
    const type: InboxType = (INBOX_TYPES as readonly string[]).includes(i.type) ? i.type : 'question';
    return { ...i, type, at: i.at ?? '', snippet: i.snippet ?? '', clientName: i.clientName ?? '', file: i.file === true,
      amount: num(i.amount), taxKopecks: num(i.taxKopecks), decidedAt: iso(i.decidedAt), repliedAt: iso(i.repliedAt) };
  }
  return raw as Deadline | Payment | Activity | Task | Question | InboxItem;
}

function toChange(c: ServerChange): Change | null {
  if (!ENTITIES.has(c.entity)) return null; // незнакомая сущность (новая на сервере) — пропускаем
  const entity = c.entity as Entity;
  // Тестовый вопрос (test: true) — для сайта его нет: приходит как удаление, даже если сервер прислал upsert.
  const testQ = entity === 'question' && c.op === 'upsert' && (c.record as { test?: unknown } | undefined)?.test === true;
  const change: Change = { cursor: c.rev, entity, op: testQ ? 'delete' : c.op, id: c.id, origin: c.origin };
  if (testQ) return change;
  if (c.op === 'upsert' && c.record !== undefined) change.record = normRecord(entity, c.record);
  return change;
}

export class LiveApi implements CabinetApi {
  constructor(private readonly url: string, private readonly auth: SessionProvider, private readonly fetchImpl: typeof fetch = fetch) {}

  /** Запрос с сеансом. Сеанс истёк — один тихий вход и повтор тем же requestId (контракт, раздел 3, п. 5). */
  private async rpc<T>(action: string, payload: unknown, requestId?: string, busyRetries = 0): Promise<Envelope<T>> {
    const once = (session: string | null) => call<T>({
      url: this.url, action, payload, session, fetchImpl: this.fetchImpl, ...(requestId ? { requestId } : {}),
    });
    for (let attempt = 0; ; attempt++) {
      try {
        try {
          return await once(this.auth.session());
        } catch (e) {
          if (!(e instanceof ApiError) || (e.code !== 'AUTH_EXPIRED' && e.code !== 'AUTH_REQUIRED')) throw e;
          return await once(await this.auth.refresh());
        }
      } catch (e) {
        // Запросы мимо очереди (новый срок, шаблон, «Месяц», ссылка, PDF, чтения): сервер занят (BUSY) — ещё раз через
        // 3 и 6 с (+ до 1 с случайно), тем же requestId — сервер не задвоит (краш-тест «Качества» 17.10, сервер).
        if (!(e instanceof ApiError) || e.code !== 'BUSY' || attempt >= busyRetries) throw e;
        await pause.sleep((attempt === 0 ? 3000 : 6000) + Math.random() * 1000);
      }
    }
  }

  async snapshot(): Promise<Snapshot> {
    const env = await this.rpc<{ clients: unknown[]; deadlines: Deadline[]; payments: Payment[]; tasks: Task[]; activity: Activity[]; questions?: Question[]; inbox?: InboxItem[];
      consultations?: unknown[]; consultationsSkipped?: unknown; cursor: number }>('sync.snapshot', {});
    const d = env.data;
    return {
      clients: d.clients.map(normClient),
      deadlines: d.deadlines.map((x) => normRecord('deadline', x) as Deadline),
      payments: d.payments.map(normPayment),
      tasks: d.tasks.map((x) => normRecord('task', x) as Task),
      activity: d.activity.map((x) => normRecord('activity', x) as Activity),
      questions: (d.questions ?? []).filter((q) => (q as { test?: unknown }).test !== true),
      inbox: (d.inbox ?? []).map((x) => normRecord('inbox', x) as InboxItem),
      consultations: (d.consultations ?? []).map(normConsultation),
      consultationsSkipped: d.consultationsSkipped === true,
      cursor: d.cursor ?? env.cursor,
    };
  }

  /** Все изменения после курсора, страницами (hasMore). CURSOR_EXPIRED уходит наверх — store берёт снимок заново. */
  async changesSince(cursor: number): Promise<{ changes: Change[]; cursor: number }> {
    const out: Change[] = [];
    let since = cursor;
    for (let page = 0; page < MAX_PAGES; page++) {
      const env = await this.rpc<{ changes: ServerChange[]; cursor: number; hasMore?: boolean }>('sync.changes', { since, limit: 500 });
      for (const c of env.data.changes) { const ch = toChange(c); if (ch) out.push(ch); }
      since = env.data.cursor;
      if (!env.data.hasMore) break;
    }
    return { changes: out, cursor: since };
  }

  async write(op: WriteOp): Promise<WriteResult> {
    const o = op.requestId;
    const up = (entity: Entity, rec: { id: string }, cursor: number): Change => ({ cursor, entity, op: 'upsert', id: rec.id, record: normRecord(entity, rec), origin: o });
    try {
      switch (op.kind) {
        case 'closeDeadline': {
          const env = await this.rpc<{ closed: Deadline; next: Deadline | null; notifyAt: string | null }>('deadlines.close', { id: op.id, baseVersion: op.baseVersion }, o);
          const changes = [up('deadline', env.data.closed, env.cursor)];
          if (env.data.next) changes.push(up('deadline', env.data.next, env.cursor));
          return { ok: true, changes, cursor: env.cursor, notifyAt: env.data.notifyAt };
        }
        case 'updateDeadlines': {
          const env = await this.rpc<{ results?: unknown[] }>('deadlines.updateMany', { items: op.items, patch: op.patch }, o);
          const changes: Change[] = [];
          const failed: NonNullable<Extract<WriteResult, { ok: true }>['failed']> = [];
          for (const raw of env.data.results ?? []) {
            const r = (raw ?? {}) as { id?: unknown; ok?: unknown; deadline?: Deadline | null; error?: { code?: unknown; message?: unknown }; current?: unknown };
            const id = typeof r.id === 'string' ? r.id : r.deadline?.id ?? '';
            if (!id) continue;
            if (r.ok === false || r.error) {
              const code = String(r.error?.code ?? '');
              const item: (typeof failed)[number] = { id, code: SITE_CODES.has(code) ? code as ErrorCode : 'SERVER', message: String(r.error?.message ?? 'Не изменился') };
              if (r.current && typeof r.current === 'object' && 'periodicity' in r.current) item.current = normRecord('deadline', r.current) as Deadline;
              failed.push(item);
            } else if (r.deadline) changes.push(up('deadline', r.deadline, env.cursor));
          }
          return { ok: true, changes, cursor: env.cursor, failed };
        }
        case 'completeTasks': {
          const env = await this.rpc<{ results?: unknown[] }>('tasks.completeMany', { items: op.ids.map((id) => ({ id })), done: op.done }, o);
          const changes: Change[] = [];
          const failed: NonNullable<Extract<WriteResult, { ok: true }>['failed']> = [];
          for (const raw of env.data.results ?? []) {
            const r = (raw ?? {}) as { id?: unknown; ok?: unknown; task?: Task | null; error?: { code?: unknown; message?: unknown } };
            const id = typeof r.id === 'string' ? r.id : r.task?.id ?? '';
            if (!id) continue;
            if (r.ok === false || r.error) {
              const code = String(r.error?.code ?? '');
              failed.push({ id, code: SITE_CODES.has(code) ? code as ErrorCode : 'SERVER', message: String(r.error?.message ?? 'Не отметилась') });
            } else if (r.task) changes.push(up('task', r.task, env.cursor));
          }
          return { ok: true, changes, cursor: env.cursor, failed };
        }
        case 'closeDeadlines': {
          // Ответ { results[], closed, failed } (форма подтверждена сервером 15.10): по каждому сроку
          // { id, ok:true, closed, next, notifyAt } или { id, ok:false, error: { code, message, … }, current }.
          const env = await this.rpc<{ results?: unknown[] }>('deadlines.closeMany', { items: op.items }, o);
          const changes: Change[] = [];
          const failed: NonNullable<Extract<WriteResult, { ok: true }>['failed']> = [];
          const nextOf: Record<string, string | null> = {};
          const seen = new Set<string>();
          for (const raw of env.data.results ?? []) {
            const r = (raw ?? {}) as { id?: unknown; ok?: unknown; closed?: Deadline | null; next?: Deadline | null; code?: unknown; message?: unknown;
              error?: { code?: unknown; message?: unknown }; current?: unknown };
            const id = typeof r.id === 'string' ? r.id : r.closed?.id ?? '';
            if (!id) continue;
            seen.add(id);
            const code = String(r.error?.code ?? r.code ?? '');
            if (r.ok === false || code) {
              const c = SITE_CODES.has(code) ? code as ErrorCode : 'SERVER';
              const item: (typeof failed)[number] = { id, code: c, message: String(r.error?.message ?? r.message ?? 'Не закрылся') };
              if (r.current && typeof r.current === 'object' && 'periodicity' in r.current) item.current = normRecord('deadline', r.current) as Deadline;
              failed.push(item);
              continue;
            }
            if (r.closed) changes.push(up('deadline', r.closed, env.cursor));
            if (r.next) changes.push(up('deadline', r.next, env.cursor));
            nextOf[id] = r.next?.id ?? null;
          }
          // Срок, о котором сервер ничего не сказал, не считаем закрытым.
          for (const it of op.items) if (!seen.has(it.id)) failed.push({ id: it.id, code: 'SERVER', message: 'Таблица не ответила по этому сроку' });
          return { ok: true, changes, cursor: env.cursor, failed, nextOf };
        }
        case 'updateTask': {
          const env = await this.rpc<{ task: Task }>('tasks.update', { id: op.id, baseVersion: op.baseVersion, patch: op.patch }, o);
          return { ok: true, changes: [up('task', env.data.task, env.cursor)], cursor: env.cursor };
        }
        case 'deleteTask': {
          const env = await this.rpc<{ deleted: string }>('tasks.delete', { id: op.id, baseVersion: op.baseVersion }, o);
          return { ok: true, changes: [{ cursor: env.cursor, entity: 'task', op: 'delete', id: env.data.deleted, origin: o }], cursor: env.cursor };
        }
        case 'reopenDeadline': {
          const env = await this.rpc<{ reopened: Deadline }>('deadlines.reopen', { id: op.id, undoOf: op.undoOf }, o);
          return { ok: true, changes: [up('deadline', env.data.reopened, env.cursor)], cursor: env.cursor };
        }
        case 'addPayment': {
          const p = op.payment;
          const env = await this.rpc<{ payment: Payment }>('payments.create', {
            payment: { id: p.id, clientId: p.clientId, kopecks: p.kopecks, period: p.period, method: p.method, date: p.date },
          }, o);
          return { ok: true, changes: [up('payment', env.data.payment, env.cursor)], cursor: env.cursor };
        }
        case 'cancelPayment': {
          const env = await this.rpc<{ cancelled: string }>('payments.cancel', { id: op.id, baseVersion: op.baseVersion }, o);
          return { ok: true, changes: [{ cursor: env.cursor, entity: 'payment', op: 'delete', id: env.data.cancelled, origin: o }], cursor: env.cursor };
        }
        case 'addClient': {
          const c = op.client;
          const env = await this.rpc<{ client: Client; createdDeadlines: Deadline[] }>('clients.create', {
            client: {
              name: c.name, kind: c.kind, marks: c.marks, employer: c.employer, kved: c.kved, phone: c.phone || null,
              keyIssuer: c.keyIssuer || null, keyFrom: c.keyFrom ?? null, keyUntil: c.keyUntil,
            },
          }, o);
          const changes = [up('client', env.data.client, env.cursor), ...env.data.createdDeadlines.map((d) => up('deadline', d, env.cursor))];
          return { ok: true, changes, cursor: env.cursor };
        }
        case 'updateClient': {
          const env = await this.rpc<{ client: Client; createdDeadlines: Deadline[] }>('clients.update', { id: op.id, baseVersion: op.baseVersion, patch: op.patch }, o);
          const changes = [up('client', env.data.client, env.cursor), ...(env.data.createdDeadlines ?? []).map((d) => up('deadline', d, env.cursor))];
          return { ok: true, changes, cursor: env.cursor };
        }
        case 'createTask': {
          const t = op.task;
          const env = await this.rpc<{ task: Task }>('tasks.create', {
            task: { id: t.id, clientId: t.clientId, text: t.text, due: t.due, type: t.type, priority: t.priority },
          }, o);
          return { ok: true, changes: [up('task', env.data.task, env.cursor)], cursor: env.cursor };
        }
        case 'createConsultation': {
          const c = op.consultation;
          const payload: Record<string, unknown> = { clientId: c.clientId, topic: c.topic };
          if (c.minutes !== null) payload.minutes = c.minutes;
          if (c.note) payload.note = c.note;
          const env = await this.rpc<{ consultation: unknown }>('consultations.create', payload, o);
          return { ok: true, changes: [up('consultation', env.data.consultation as { id: string }, env.cursor)], cursor: env.cursor };
        }
        case 'updateDeadline': {
          const env = await this.rpc<{ deadline: Deadline }>('deadlines.update', { id: op.id, baseVersion: op.baseVersion, patch: op.patch }, o);
          return { ok: true, changes: [up('deadline', env.data.deadline, env.cursor)], cursor: env.cursor };
        }
        case 'hideInbox':
        case 'unhideInbox': {
          // results[] по каждому: скрыто — для сайта удаление; возвращено — сообщение снова (upsert). Уже скрытое и
          // несуществующее при скрытии — для сайта всё равно «нет» (удаление); не вернулось (прошло 24 ч) — в failed.
          const hide = op.kind === 'hideInbox';
          const env = await this.rpc<{ results?: unknown[] }>(hide ? 'inbox.hide' : 'inbox.unhide', { ids: op.ids }, o);
          const changes: Change[] = [];
          const failed: NonNullable<Extract<WriteResult, { ok: true }>['failed']> = [];
          for (const raw of env.data.results ?? []) {
            const r = (raw ?? {}) as { id?: unknown; ok?: unknown; inbox?: unknown; error?: { code?: unknown; message?: unknown } };
            const id = text(r.id);
            if (!id) continue;
            if (hide) { changes.push({ cursor: env.cursor, entity: 'inbox', op: 'delete', id, origin: o }); continue; }
            if (r.ok === true && r.inbox) changes.push(up('inbox', r.inbox as { id: string }, env.cursor));
            else {
              const code = String(r.error?.code ?? '');
              failed.push({ id, code: SITE_CODES.has(code) ? code as ErrorCode : 'SERVER', message: String(r.error?.message ?? 'Не вернулось') });
            }
          }
          return { ok: true, changes, cursor: env.cursor, failed };
        }
        case 'decideInbox': {
          // Ответ сервера — само сообщение и то, что из него получилось (платёж или задача); остальное — опросом.
          const payload: Record<string, unknown> = { id: op.id, action: op.action };
          if (op.amount !== undefined) payload.amount = op.amount;
          const env = await this.rpc<{ inbox: InboxItem; payment?: Payment | null; task?: Task | null }>('inbox.decide', payload, o);
          const changes = [up('inbox', env.data.inbox, env.cursor)];
          if (env.data.payment) changes.push(up('payment', env.data.payment, env.cursor));
          if (env.data.task) changes.push(up('task', env.data.task, env.cursor));
          return { ok: true, changes, cursor: env.cursor };
        }
        case 'answerQuestion': {
          const env = await this.rpc<{ question: Question }>('questions.answer', { id: op.id, text: op.text }, o);
          return { ok: true, changes: [up('question', env.data.question, env.cursor)], cursor: env.cursor };
        }
        case 'completeTask': {
          const env = await this.rpc<{ task: Task }>('tasks.complete', { id: op.id, done: op.done }, o);
          return { ok: true, changes: [up('task', env.data.task, env.cursor)], cursor: env.cursor };
        }
      }
    } catch (e) {
      if (!(e instanceof ApiError)) return { ok: false, code: 'SERVER', message: 'Таблица не ответила — попробуйте ещё раз' };
      // AUTH_INVALID, CURSOR_EXPIRED, UNSUPPORTED_VERSION и незнакомое — для очереди это «не сохранилось, повторить».
      const code: ErrorCode = SITE_CODES.has(e.code) ? e.code as ErrorCode : 'SERVER';
      const res: WriteResult = { ok: false, code, message: e.message };
      if (e.retryAt) res.retryAt = e.retryAt;
      if (e.retryable) res.retryable = true;
      if (e.current && typeof e.current === 'object') {
        res.current = 'kind' in e.current ? normClient(e.current) : e.current as Deadline | Payment | Question | InboxItem | Task;
      }
      return res;
    }
  }

  async listPayments(month: string): Promise<{ payments: Payment[]; totalKopecks: number }> {
    const env = await this.rpc<{ payments: unknown[]; totalKopecks: number }>('payments.list', { month });
    return { payments: (env.data.payments ?? []).map(normPayment), totalKopecks: env.data.totalKopecks };
  }

  async listQuestions(): Promise<Question[]> {
    const env = await this.rpc<{ questions: Question[] }>('questions.list', {});
    return (env.data.questions ?? []).filter((q) => (q as { test?: unknown }).test !== true);
  }

  /** Напоминание клиенту: запись с requestId (сервер не отправит дважды), но мимо очереди — ответ показываем сразу. */
  async remindClient(req: RemindRequest, requestId: string): Promise<RemindResult> {
    const payload: Record<string, unknown> = { clientId: req.clientId, kind: req.kind, text: req.text };
    if (req.deadlineId) payload.deadlineId = req.deadlineId;
    if (req.period) payload.period = req.period;
    try {
      const env = await this.rpc<{ sent?: unknown; sentAt?: unknown; preview?: unknown; reason?: unknown; message?: unknown }>('clients.remind', payload, requestId);
      const d = env.data;
      if (d.sent === true) return { sent: true, sentAt: text(d.sentAt) || null, preview: text(d.preview) || null };
      const reason = d.reason === 'noBot' || d.reason === 'test' ? d.reason : 'unknown';
      return { sent: false, reason, message: text(d.message) || (reason === 'noBot' ? 'У клиента нет бота в Telegram' : reason === 'test' ? 'Тестовый режим — сообщение не ушло' : 'Не знаю, ушло ли — проверьте в Telegram') };
    } catch (e) {
      if (e instanceof ApiError && e.code === 'RATE_LIMIT') {
        const r: RemindResult = { sent: false, reason: 'rateLimit', message: e.message || 'Этому клиенту уже напоминали недавно' };
        if (e.retryAt) r.retryAt = e.retryAt;
        return r;
      }
      throw e;
    }
  }

  async createDeadline(d: NewDeadline, requestId: string): Promise<CreateDeadlineResult> {
    const deadline: Record<string, unknown> = { id: requestId, clientId: d.clientId, obligation: d.obligation, due: d.due, periodicity: d.periodicity };
    if (d.note) deadline.note = d.note;
    try {
      const env = await this.rpc<{ deadline: unknown }>('deadlines.create', { deadline }, requestId, 2);
      return { ok: true, deadline: normRecord('deadline', env.data.deadline) as Deadline };
    } catch (e) {
      const code = e instanceof ApiError && SITE_CODES.has(e.code) ? e.code as ErrorCode : null;
      if (e instanceof ApiError && code && !RETRYABLE.has(code)) {
        const cur = e.current && typeof e.current === 'object' && 'what' in e.current ? normRecord('deadline', e.current) as Deadline : null;
        return { ok: false, code, message: e.message, field: e.field, current: cur };
      }
      throw e; // нет связи, занято — окно скажет «повторите», тот же requestId
    }
  }

  /** VALIDATION / CONFLICT … — ответом с полем; нет связи и «занято» — бросить (окно скажет «ещё раз»). */
  private refusal(e: unknown): { ok: false; code: ErrorCode; message: string; field: string | null } {
    const code = e instanceof ApiError && SITE_CODES.has(e.code) ? e.code as ErrorCode : null;
    if (e instanceof ApiError && code && !RETRYABLE.has(code)) return { ok: false, code, message: e.message, field: e.field };
    throw e;
  }

  async previewTemplate(clientId: string, template?: DeadlineTemplate) {
    try {
      const env = await this.rpc<{ template?: unknown; wouldAdd?: unknown[]; skipped?: unknown[] }>('deadlines.applyTemplate', { clientId, ...(template ? { template } : {}), dryRun: true }, undefined, 2);
      const d = env.data;
      return {
        template: text(d.template) as DeadlineTemplate,
        wouldAdd: (d.wouldAdd ?? []).map((x) => { const r = x as Record<string, unknown>; return { obligation: text(r.obligation), periodicity: (text(r.periodicity) || 'once') as Deadline['periodicity'], due: text(r.due) }; }),
        skipped: (d.skipped ?? []).map(text),
      };
    } catch (e) {
      return this.refusal(e);
    }
  }

  async applyTemplate(clientId: string, template: DeadlineTemplate | undefined, requestId: string): Promise<ApplyTemplateResult> {
    try {
      const env = await this.rpc<{ template?: unknown; added?: unknown[]; skipped?: unknown[] }>('deadlines.applyTemplate', { clientId, ...(template ? { template } : {}) }, requestId, 2);
      const d = env.data;
      return { ok: true, template: text(d.template) as DeadlineTemplate, added: (d.added ?? []).map((x) => normRecord('deadline', x) as Deadline), skipped: (d.skipped ?? []).map(text) };
    } catch (e) {
      return this.refusal(e);
    }
  }

  async inboxHideAll(): Promise<{ hidden: number; ids: string[]; more: boolean }> {
    const env = await this.rpc<{ hidden?: unknown; ids?: unknown[]; more?: unknown }>('inbox.hideAll', {}, undefined, 2);
    const ids = (env.data.ids ?? []).map(text).filter(Boolean);
    return { hidden: num(env.data.hidden) ?? ids.length, ids, more: env.data.more === true };
  }

  async clientBotLink(clientId: string): Promise<BotLinkResult> {
    const env = await this.rpc<{ connected?: unknown; link?: unknown; expiresAt?: unknown }>('clients.botLink', { clientId }, undefined, 2);
    const d = env.data;
    return { connected: d.connected === true, link: text(d.link) || null, expiresAt: text(d.expiresAt) || null };
  }

  async statementPdf(clientId: string): Promise<StatementPdf> {
    const env = await this.rpc<{ url?: unknown; fileName?: unknown }>('clients.statementPdf', { clientId }, undefined, 2);
    const url = text(env.data.url);
    if (!/^https:\/\//.test(url)) throw new ApiError({ code: 'SERVER', message: 'Таблица не дала ссылку на выписку — попробуйте ещё раз' });
    return { url, fileName: text(env.data.fileName) };
  }

  async statementPreview(clientId: string): Promise<StatementPreview> {
    const env = await this.rpc<{ preview?: unknown; reason?: unknown; message?: unknown }>('clients.sendStatement', { clientId, preview: true });
    const d = env.data;
    const reason = d.reason === 'noBot' || d.reason === 'test' ? d.reason : null;
    return { preview: text(d.preview) || null, reason, message: text(d.message) || null };
  }

  /** Как remindClient: ушло / не ушло / неизвестно / рано (RATE_LIMIT, retryAt). */
  async sendStatement(clientId: string, requestId: string): Promise<StatementResult> {
    try {
      const env = await this.rpc<{ sent?: unknown; sentAt?: unknown; preview?: unknown; reason?: unknown; message?: unknown }>('clients.sendStatement', { clientId }, requestId);
      const d = env.data;
      if (d.sent === true) return { sent: true, sentAt: text(d.sentAt) || null, preview: text(d.preview) || null };
      const reason = d.reason === 'noBot' || d.reason === 'test' ? d.reason : 'unknown';
      return { sent: false, reason, message: text(d.message) || (reason === 'noBot' ? 'У клиента нет бота в Telegram' : reason === 'test' ? 'Тестовый режим — выписка не ушла' : 'Не знаю, ушло ли — проверьте в Telegram') };
    } catch (e) {
      if (e instanceof ApiError && e.code === 'RATE_LIMIT') {
        const r: StatementResult = { sent: false, reason: 'rateLimit', message: e.message || 'Этому клиенту уже писали недавно' };
        if (e.retryAt) r.retryAt = e.retryAt;
        return r;
      }
      throw e;
    }
  }

  async listArchive(clientId: string, offset = 0, limit = 50): Promise<ArchivePage> {
    const env = await this.rpc<{ items?: unknown[]; total?: unknown; more?: unknown }>('deadlines.listArchive', { clientId, offset, limit }, undefined, 2);
    const per = (x: unknown): Deadline['periodicity'] => (x === 'month' || x === 'quarter' || x === 'year' ? x : 'once');
    const st = (x: unknown): ArchivedDeadline['status'] => (x === 'inProgress' || x === 'waiting' || x === 'postponed' || x === 'new' || x === 'archived' ? x : 'done');
    const items = (env.data.items ?? []).map((x) => {
      const r = x as Record<string, unknown>;
      return { id: text(r.id) || null, what: text(r.what) || text(r.obligation), periodicity: per(r.periodicity), due: text(r.due) || null,
        periodEnd: text(r.periodEnd) || null, status: st(r.status), reason: text(r.reason) || null, closedAt: text(r.closedAt) || null, archivedAt: text(r.archivedAt) || null };
    });
    return { items, total: num(env.data.total) ?? items.length, more: env.data.more === true };
  }

  async attention(limit = 10): Promise<AttentionItem[]> {
    const env = await this.rpc<{ items?: unknown[] }>('reports.attention', { limit }, undefined, 2);
    return (env.data.items ?? []).map((x) => {
      const r = x as Record<string, unknown>;
      const level = r.level === 'high' || r.level === 'mid' ? r.level : 'low';
      return { clientId: text(r.clientId), name: text(r.name), score: num(r.score) ?? 0, level,
        factors: Array.isArray(r.factors) ? r.factors.map((f) => { const g = f as Record<string, unknown>; return { label: text(g.label), weight: num(g.weight) ?? 0 }; }) : [] };
    });
  }

  private monthItem(x: unknown): MonthItem {
    const r = (x ?? {}) as Record<string, unknown>;
    const c = (r.checks ?? {}) as Record<string, unknown>;
    const checks = Object.fromEntries(MONTH_CHECKS.map((k) => [k, c[k] === true])) as Record<MonthCheck, boolean>;
    return { clientId: text(r.clientId) || null, name: text(r.name), period: text(r.period), status: text(r.status) || null,
      comment: text(r.comment) || null, percent: num(r.percent) ?? 0, checks };
  }

  async monthGet(): Promise<MonthSheet> {
    const env = await this.rpc<{ period?: unknown; items?: unknown[] }>('month.get', {}, undefined, 2);
    return { period: text(env.data.period) || null, items: (env.data.items ?? []).map((x) => this.monthItem(x)) };
  }

  async monthSet(clientId: string, item: MonthCheck, done: boolean): Promise<MonthItem> {
    const env = await this.rpc<{ item?: unknown }>('month.set', { clientId, item, done }, undefined, 2);
    return this.monthItem(env.data.item);
  }

  /** «Не писать клиенту»: снять сообщение о закрытии срока, пока оно ждёт 2 мин. С requestId, мимо очереди —
   *  через 2 мин действие уже бессмысленно, а ответ нужен сразу. */
  async cancelNotify(deadlineId: string, requestId: string): Promise<CancelNotifyResult> {
    try {
      const env = await this.rpc<{ cancelled?: unknown }>('deadlines.cancelNotify', { id: deadlineId }, requestId, 2);
      return env.data.cancelled === true ? { status: 'cancelled' } : { status: 'nothing' };
    } catch (e) {
      if (e instanceof ApiError && e.code === 'CONFLICT') {
        const cur = e.current as { sentAt?: unknown } | null;
        return { status: 'sent', sentAt: text(cur?.sentAt) || null };
      }
      throw e;
    }
  }

  /** Пробный запуск напоминания: сервер собирает текст на языке клиента и ничего не отправляет. */
  async remindPreview(req: Omit<RemindRequest, 'text'>): Promise<RemindPreview> {
    const payload: Record<string, unknown> = { clientId: req.clientId, kind: req.kind, preview: true };
    if (req.deadlineId) payload.deadlineId = req.deadlineId;
    if (req.period) payload.period = req.period;
    const env = await this.rpc<{ preview?: unknown; lang?: unknown; reason?: unknown; message?: unknown }>('clients.remind', payload);
    const d = env.data;
    return { preview: text(d.preview) || null, lang: text(d.lang) || null, reason: d.reason === 'noBot' || d.reason === 'test' ? d.reason : null, message: text(d.message) || null };
  }

  /** Карточка целиком: чтение, без requestId. Пустые клетки нормализуются, как в снимке. */
  async clientCard(id: string): Promise<ClientCard> {
    const env = await this.rpc<{ client: unknown; deadlines?: unknown[]; payments?: unknown[]; tasks?: unknown[]; history?: unknown[]; consultations?: unknown[] }>('clients.get', { id }, undefined, 2);
    const d = env.data;
    return {
      client: normClient(d.client),
      deadlines: (d.deadlines ?? []).map((x) => normRecord('deadline', x) as Deadline),
      payments: (d.payments ?? []).map(normPayment),
      tasks: (d.tasks ?? []).map((x) => normRecord('task', x) as Task),
      history: (d.history ?? []).map((x) => normRecord('activity', x) as Activity),
      consultations: (d.consultations ?? []).map(normConsultation),
    };
  }

  /** Справочник читается без requestId и мимо очереди: это чтение. */
  async referenceRates(year?: number): Promise<Rates> {
    const env = await this.rpc<unknown>('reference.rates', year ? { year } : {});
    return normRates(env.data);
  }

  /** Сервер ищет и по укороченному коду («56.30» → «56.3» → «56»); не нашлось — items пуст и note. */
  async referenceKved(q: string): Promise<KvedFound> {
    const env = await this.rpc<{ items?: unknown[]; note?: unknown }>('reference.kved', { q });
    return { items: (env.data.items ?? []).map(normKved).filter((k) => k.code), note: text(env.data.note) || null };
  }

  /** Весь лист КВЕДов: решение горсовета одно на лист — подставляем его в строки, где своего нет. */
  async referenceKvedAll(): Promise<KvedAll> {
    const env = await this.rpc<{ items?: unknown[]; councilDecision?: unknown; updatedAt?: unknown }>('reference.kved', { all: true });
    const council = text(env.data.councilDecision) || null;
    return {
      items: (env.data.items ?? []).map(normKved).filter((k) => k.code).map((k) => ({ ...k, councilDecision: k.councilDecision ?? council })),
      councilDecision: council,
      updatedAt: text(env.data.updatedAt) || null,
    };
  }

  /** Счётчики сервера за день (только owner, контракт 8.8) — рядом со ступенями сайта. */
  async diagCounters(): Promise<DiagCounters> {
    const env = await this.rpc<DiagCounters>('diag.counters', {});
    return env.data;
  }

  /** Пароль — отдельный запрос по явному «Показать», мимо очереди и IndexedDB (контракт, 8.2). RATE_LIMIT не повторяем. */
  async revealPassword(clientId: string): Promise<{ login: string; password: string; ttlSeconds: number }> {
    const env = await this.rpc<{ login: string; password: string; ttlSeconds: number }>('clients.revealPassword', { id: clientId, confirm: true });
    return env.data;
  }
}
