// Живой адаптер: тот же CabinetApi, что у выдуманного сервера, но поверх JSON-API Apps Script
// (docs/api-contract.md v2.1). Экраны и очередь записей не знают, с кем говорят.
import { ApiError, call } from './transport';
import type { Envelope } from './transport';
import type { CabinetApi, Change, Entity, ErrorCode, Snapshot, WriteOp, WriteResult } from './api';
import type { Activity, Client, Deadline, InboxItem, Payment, Question, Task } from './types';

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

const ENTITIES: ReadonlySet<string> = new Set<Entity>(['client', 'deadline', 'payment', 'activity', 'task', 'question', 'inbox']);
const SITE_CODES: ReadonlySet<string> = new Set<ErrorCode>(['NETWORK', 'CONFLICT', 'PERIOD_OPEN', 'NOT_FOUND', 'SERVER', 'VALIDATION',
  'UNDO_TOO_LATE', 'DUPLICATE', 'BUSY', 'MAINTENANCE', 'QUOTA', 'RATE_LIMIT', 'AUTH_EXPIRED', 'AUTH_REQUIRED', 'FORBIDDEN']);
const MAX_PAGES = 20;

// Сервер отдаёт пустое как null (контракт, раздел 2); экраны сайта ждут строку.
function normClient(raw: unknown): Client {
  const c = raw as Client & { phone: string | null; keyIssuer: string | null };
  return { ...c, phone: c.phone ?? '', keyIssuer: c.keyIssuer ?? '', marks: c.marks ?? [], kved: c.kved ?? [], monthly: c.monthly ?? [] };
}

function normRecord(entity: Entity, raw: unknown): NonNullable<Change['record']> {
  if (entity === 'client') return normClient(raw);
  // Срок, чьего клиента нет в «Клиентах», сервер отдаёт с clientId: null.
  if (entity === 'deadline') { const d = raw as Deadline & { clientId: string | null }; return { ...d, clientId: d.clientId ?? '' }; }
  return raw as Deadline | Payment | Activity | Task | Question | InboxItem;
}

function toChange(c: ServerChange): Change | null {
  if (!ENTITIES.has(c.entity)) return null; // незнакомая сущность (новая на сервере) — пропускаем
  const entity = c.entity as Entity;
  const change: Change = { cursor: c.rev, entity, op: c.op, id: c.id, origin: c.origin };
  if (c.op === 'upsert' && c.record !== undefined) change.record = normRecord(entity, c.record);
  return change;
}

export class LiveApi implements CabinetApi {
  constructor(private readonly url: string, private readonly auth: SessionProvider, private readonly fetchImpl: typeof fetch = fetch) {}

  /** Запрос с сеансом. Сеанс истёк — один тихий вход и повтор тем же requestId (контракт, раздел 3, п. 5). */
  private async rpc<T>(action: string, payload: unknown, requestId?: string): Promise<Envelope<T>> {
    const once = (session: string | null) => call<T>({
      url: this.url, action, payload, session, fetchImpl: this.fetchImpl, ...(requestId ? { requestId } : {}),
    });
    try {
      return await once(this.auth.session());
    } catch (e) {
      if (!(e instanceof ApiError) || (e.code !== 'AUTH_EXPIRED' && e.code !== 'AUTH_REQUIRED')) throw e;
      return once(await this.auth.refresh());
    }
  }

  async snapshot(): Promise<Snapshot> {
    const env = await this.rpc<{ clients: unknown[]; deadlines: Deadline[]; payments: Payment[]; tasks: Task[]; activity: Activity[]; questions?: Question[]; inbox?: InboxItem[]; cursor: number }>('sync.snapshot', {});
    const d = env.data;
    return {
      clients: d.clients.map(normClient),
      deadlines: d.deadlines.map((x) => normRecord('deadline', x) as Deadline),
      payments: d.payments,
      tasks: d.tasks,
      activity: d.activity,
      questions: d.questions ?? [],
      inbox: d.inbox ?? [],
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
        case 'updateDeadline': {
          const env = await this.rpc<{ deadline: Deadline }>('deadlines.update', { id: op.id, baseVersion: op.baseVersion, patch: op.patch }, o);
          return { ok: true, changes: [up('deadline', env.data.deadline, env.cursor)], cursor: env.cursor };
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
      if (e.current && typeof e.current === 'object') {
        res.current = 'kind' in e.current ? normClient(e.current) : e.current as Deadline | Payment | Question | InboxItem;
      }
      return res;
    }
  }

  async listPayments(month: string): Promise<{ payments: Payment[]; totalKopecks: number }> {
    const env = await this.rpc<{ payments: Payment[]; totalKopecks: number }>('payments.list', { month });
    return env.data;
  }

  async listQuestions(): Promise<Question[]> {
    const env = await this.rpc<{ questions: Question[] }>('questions.list', {});
    return env.data.questions;
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
