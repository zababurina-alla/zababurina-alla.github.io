// Учебный сервер по контракту v2.1 — чтобы до готовности Apps Script проверить сайт целиком: вход через Google
// (ID-токен проверяется у Google, как будет на сервере), снимок, изменения, записи, истечение сеанса.
// Данные — выдуманные (src/data/fakeServer.ts). Только для разработки: подключается к dev-серверу Vite при MOCK_API=1,
// в сборку сайта не попадает. Запуск: npm run dev:mock. Кого пускать — MOCK_ALLOWED (почты через запятую) или
// файл .mock-allowed в корне (в .gitignore: почты в публичный репозиторий не кладём).
// MOCK_SESSION_TTL — срок сеанса в секундах (по умолчанию 12 ч), чтобы проверить тихий повторный вход.
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';

interface Ctx {
  fake: FakeLike; nonces: Set<string>; sessions: Map<string, { email: string; name: string; exp: number }>;
  counters: { received: number; applied: number; rejectedByCode: Record<string, number>; repeats: number; seen: Set<string> };
}
interface FakeLike {
  snapshot(): Promise<{ cursor: number } & Record<string, unknown>>;
  listPayments(month: string): Promise<unknown>;
  listQuestions(): Promise<unknown[]>;
  referenceRates(year?: number): Promise<unknown>;
  referenceKved(q: string): Promise<unknown[]>;
  changesSince(c: number): Promise<{ changes: { cursor: number; entity: string; op: string; id: string; origin: string; record?: unknown }[]; cursor: number }>;
  write(op: Record<string, unknown>): Promise<{ ok: true; changes: { entity: string; op: string; id: string; record?: { id: string } }[]; cursor: number; notifyAt?: string | null }
    | { ok: false; code: string; message: string; current?: unknown; retryAt?: string }>;
}

const CLIENT_ID = '1078049272948-bnvonl9qah7npdq63gktbio1rm2lbgvb.apps.googleusercontent.com';
const TTL_MS = Number(process.env.MOCK_SESSION_TTL ?? 12 * 3600) * 1000;

const fail = (code: string, message: string, extra: Record<string, unknown> = {}, current: unknown = null) =>
  ({ ok: false, error: { code, message, retryable: false, field: null, ...extra }, current });

function allowedEmails(): string[] {
  const fromFile = existsSync('.mock-allowed') ? readFileSync('.mock-allowed', 'utf8') : '';
  return (process.env.MOCK_ALLOWED ?? fromFile).split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
}

function fakeLogin(email: string): { email: string; name: string } | string {
  return allowedEmails().includes(email.toLowerCase()) ? { email, name: 'Проверка' } : 'FORBIDDEN';
}

async function verifyIdToken(idToken: string, nonce: string): Promise<{ email: string; name: string } | string> {
  const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`, { signal: AbortSignal.timeout(10_000) });
  if (!r.ok) return 'AUTH_INVALID';
  const t = await r.json() as Record<string, string>;
  const issOk = t.iss === 'accounts.google.com' || t.iss === 'https://accounts.google.com';
  if (t.aud !== CLIENT_ID || !issOk || Number(t.exp) * 1000 < Date.now() || t.email_verified !== 'true' || t.nonce !== nonce) return 'AUTH_INVALID';
  if (!allowedEmails().includes((t.email ?? '').toLowerCase())) return 'FORBIDDEN';
  return { email: t.email ?? '', name: t.given_name ?? t.name ?? t.email ?? '' };
}

async function handle(ctx: Ctx, body: { action: string; payload?: Record<string, unknown>; session?: string; requestId?: string }) {
  const p = body.payload ?? {};
  const env = (data: unknown, cursor: number) => ({ ok: true, data, cursor, serverTime: new Date().toISOString() });
  if (body.action === 'auth.nonce') {
    const nonce = randomUUID();
    ctx.nonces.add(nonce);
    return env({ nonce }, 0);
  }
  if (body.action === 'auth.login') {
    const nonce = String(p.nonce ?? '');
    if (!ctx.nonces.delete(nonce)) return fail('AUTH_INVALID', 'Не получилось войти — попробуйте ещё раз');
    // Учебный вход без Google («mock:почта») — для автоматических проверок, где всплывающее окно Google не открыть.
    // Только на этом компьютере и только для почт из списка допуска; настоящий токен проверяется у Google.
    const token = String(p.idToken ?? '');
    const who = token.startsWith('mock:') ? fakeLogin(token.slice(5)) : await verifyIdToken(token, nonce);
    if (who === 'FORBIDDEN') return fail('FORBIDDEN', 'У этого аккаунта нет доступа к кабинету');
    if (typeof who === 'string') return fail('AUTH_INVALID', 'Не получилось войти — попробуйте ещё раз');
    const session = `mock-${randomUUID()}`;
    const exp = Date.now() + TTL_MS;
    ctx.sessions.set(session, { ...who, exp });
    return env({ session, expiresAt: new Date(exp).toISOString(), user: { email: who.email, name: who.name, role: 'owner' } }, 0);
  }
  const s = body.session ? ctx.sessions.get(body.session) : undefined;
  if (!s) return fail('AUTH_REQUIRED', 'Войдите, чтобы продолжить');
  if (s.exp < Date.now()) return fail('AUTH_EXPIRED', 'Сеанс истёк');

  const f = ctx.fake;
  if (body.action === 'auth.me') return env({ email: s.email, name: s.name, role: 'owner' }, 0);
  if (body.action === 'sync.snapshot') { const snap = await f.snapshot(); return env(snap, snap.cursor); }
  if (body.action === 'sync.changes') {
    const r = await f.changesSince(Number(p.since ?? 0));
    return env({ changes: r.changes.map((c) => ({ rev: c.cursor, entity: c.entity, op: c.op, id: c.id, origin: c.origin, record: c.record })), cursor: r.cursor, hasMore: false }, r.cursor);
  }
  if (body.action === 'diag.counters') return env({ received: ctx.counters.received, applied: ctx.counters.applied, rejectedByCode: ctx.counters.rejectedByCode, repeats: ctx.counters.repeats }, 0);
  if (body.action === 'payments.list') return env(await f.listPayments(String(p.month ?? '')), 0);
  if (body.action === 'reference.rates') return env(await f.referenceRates(typeof p.year === 'number' ? p.year : undefined), 0);
  if (body.action === 'reference.kved') return env({ items: await f.referenceKved(String(p.q ?? '')) }, 0);
  if (body.action === 'questions.list') return env({ questions: await f.listQuestions() }, 0);
  if (body.action === 'clients.revealPassword') return env({ login: 'учебный-логин', password: 'учебный-пароль', ttlSeconds: 30 }, 0);

  const rid = body.requestId ?? randomUUID();
  const cnt = ctx.counters;
  cnt.received++;
  if (cnt.seen.has(rid)) cnt.repeats++; else cnt.seen.add(rid);
  const ops: Record<string, () => Record<string, unknown>> = {
    'deadlines.close': () => ({ kind: 'closeDeadline', id: p.id, baseVersion: p.baseVersion }),
    'deadlines.reopen': () => ({ kind: 'reopenDeadline', id: p.id, undoOf: p.undoOf }),
    'payments.create': () => ({ kind: 'addPayment', payment: { ...(p.payment as object), version: 0, source: 'сайт' } }),
    'payments.cancel': () => ({ kind: 'cancelPayment', id: p.id, baseVersion: p.baseVersion }),
    'clients.create': () => ({ kind: 'addClient', client: { ...(p.client as object), id: 'tmp', version: 0, monthly: [] } }),
    'clients.update': () => ({ kind: 'updateClient', id: p.id, baseVersion: p.baseVersion, patch: p.patch }),
    'deadlines.update': () => ({ kind: 'updateDeadline', id: p.id, baseVersion: p.baseVersion, patch: p.patch }),
    'tasks.create': () => ({ kind: 'createTask', task: { ...(p.task as object), version: 1, done: false } }),
    'tasks.complete': () => ({ kind: 'completeTask', id: p.id, done: p.done }),
    'questions.answer': () => ({ kind: 'answerQuestion', id: p.id, text: p.text }),
    'inbox.decide': () => ({ kind: 'decideInbox', id: p.id, action: p.action, ...(p.amount !== undefined ? { amount: p.amount } : {}) }),
  };
  const make = ops[body.action];
  if (!make) return fail('SERVER', `Неизвестное действие ${body.action}`);
  const r = await f.write({ ...make(), requestId: rid });
  if (!r.ok) {
    cnt.rejectedByCode[r.code] = (cnt.rejectedByCode[r.code] ?? 0) + 1;
    return fail(r.code, r.message, r.retryAt ? { retryable: true, retryAt: r.retryAt } : {}, r.current ?? null);
  }
  cnt.applied++;
  const recs = (entity: string) => r.changes.filter((c) => c.entity === entity && c.op === 'upsert').map((c) => c.record);
  switch (body.action) {
    case 'deadlines.close': {
      const ds = recs('deadline');
      return env({ closed: ds.find((d) => d?.id === p.id), next: ds.find((d) => d?.id !== p.id) ?? null, notifyAt: r.notifyAt ?? null }, r.cursor);
    }
    case 'deadlines.reopen': return env({ reopened: recs('deadline').find((d) => d?.id === p.id) }, r.cursor);
    case 'payments.create': return env({ payment: recs('payment')[0] }, r.cursor);
    case 'payments.cancel': return env({ cancelled: p.id }, r.cursor);
    case 'questions.answer': return env({ question: recs('question')[0] }, r.cursor);
    case 'deadlines.update': return env({ deadline: recs('deadline')[0] }, r.cursor);
    case 'inbox.decide': return env({ inbox: recs('inbox')[0], payment: recs('payment')[0] ?? null, task: recs('task')[0] ?? null }, r.cursor);
    case 'clients.create':
    case 'clients.update': return env({ client: recs('client')[0], createdDeadlines: recs('deadline') }, r.cursor);
    default: return env({ task: recs('task')[0] }, r.cursor);
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (c: string) => { data += c; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export function mockApi(): Plugin {
  return {
    name: 'mock-api',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      if (process.env.MOCK_API !== '1') return;
      let ctx: Ctx | null = null;
      server.middlewares.use('/mock-api', (req: IncomingMessage, res: ServerResponse) => {
        void (async () => {
          // Как Apps Script: всегда 200, JSON в теле, CORS открыт.
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          if (req.method !== 'POST') { res.end(JSON.stringify(fail('SERVER', 'Только POST'))); return; }
          try {
            if (!ctx) {
              const mod = await server.ssrLoadModule('/src/data/fakeServer.ts') as { fakeServer: FakeLike };
              ctx = { fake: mod.fakeServer, nonces: new Set(), sessions: new Map(), counters: { received: 0, applied: 0, rejectedByCode: {}, repeats: 0, seen: new Set() } };
            }
            const body = JSON.parse(await readBody(req)) as Parameters<typeof handle>[1];
            res.end(JSON.stringify(await handle(ctx, body)));
          } catch (e) {
            res.end(JSON.stringify(fail('SERVER', 'Учебный сервер упал', { detail: String(e) })));
          }
        })();
      });
    },
  };
}
