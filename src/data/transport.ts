// Транспорт к Apps Script по контракту (docs/api-contract.md, раздел 2): один адрес, POST text/plain без своих
// заголовков (иначе браузер шлёт preflight, а Apps Script его не обслуживает), ответ всегда HTTP 200 с ok/error в теле.
// Таймаут 30 с, у чтений первой загрузки — 75 с и один тихий повтор (холодный старт, см. READ_TIMEOUT_MS).
// Ничего не логирует: в теле бывают сеанс, ID-токен и (у revealPassword) пароль.
import type { ErrorCode } from './api';

export const TIMEOUT_MS = 30_000;

/** Холодный старт Apps Script (замер 22.10 с ПК владельца): сам код отвечает за 1–7 с, но первый запрос после паузы
 *  ждёт запуска 30–52 с (bootMs p95 179 с) и иногда приходит 404-страницей Google или телом «ok» вместо JSON.
 *  Чтения, с которых начинается работа, ждут дольше и при таком сбое один раз тихо повторяются. Записям хватает 30 с:
 *  у них очередь с повтором. */
export const READ_TIMEOUT_MS = 75_000;
const COLD_READS = /^(sync\.(snapshot|changes)|clients\.photos|reports\.)/;
/** Пауза перед повтором (2–3 с); в тестах подменяется. */
export const coldPause = { sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) };

export interface Envelope<T> {
  ok: true;
  data: T;
  cursor: number;
  serverTime?: string;
}

export interface ServerError {
  code: ErrorCode | 'AUTH_INVALID' | 'CURSOR_EXPIRED' | 'UNSUPPORTED_VERSION' | 'DISABLED';
  message: string;
  retryable?: boolean;
  field?: string | null;
  retryAt?: string;
}

/** Отказ сервера или сети в одном виде: code — из контракта (раздел 9) или NETWORK. */
export class ApiError extends Error {
  readonly code: ServerError['code'];
  readonly retryAt: string | undefined;
  readonly field: string | null;
  readonly current: unknown;
  /** Сервер сам сказал «можно повторить» (SERVER при сбое листа, BUSY) — очередь повторит тем же requestId. */
  readonly retryable: boolean;
  constructor(err: ServerError, current?: unknown) {
    super(err.message);
    this.name = 'ApiError';
    this.code = err.code;
    this.retryable = err.retryable === true;
    this.retryAt = err.retryAt;
    this.field = err.field ?? null;
    this.current = current ?? null;
  }
}

export interface CallArgs {
  url: string;
  action: string;
  payload?: unknown;
  session?: string | null;
  requestId?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Сбои, похожие на холодный старт: обрыв или таймаут, не-JSON, «ok». Ответ сервера с кодом ошибки сюда не входит. */
const coldLike = new WeakSet<ApiError>();
function cold(err: ServerError): ApiError {
  const e = new ApiError(err);
  coldLike.add(e);
  return e;
}

export async function call<T>(args: CallArgs): Promise<Envelope<T>> {
  if (!COLD_READS.test(args.action)) return callOnce<T>(args);
  const read = { ...args, timeoutMs: args.timeoutMs ?? READ_TIMEOUT_MS };
  try {
    return await callOnce<T>(read);
  } catch (e) {
    if (!(e instanceof ApiError) || !coldLike.has(e)) throw e;
    await coldPause.sleep(2000 + Math.random() * 1000);
    return callOnce<T>(read);
  }
}

async function callOnce<T>({ url, action, payload = {}, session, requestId, fetchImpl = fetch, timeoutMs = TIMEOUT_MS }: CallArgs): Promise<Envelope<T>> {
  // sentAt — часы браузера (мс): сервер считает по нему время пути до своего кода (arriveMs в diag.counters) — так видны
  // холодные старты Apps Script (координатор 16.10, разбор зависаний auth.nonce).
  const body: Record<string, unknown> = { v: 1, action, payload, sentAt: Date.now() };
  if (session) body.session = session;
  if (requestId) body.requestId = requestId;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow',
      credentials: 'omit',
      cache: 'no-store',
      signal: ctrl.signal,
    });
  } catch {
    throw cold({ code: 'NETWORK', message: 'Нет связи с таблицей' });
  } finally {
    clearTimeout(timer);
  }
  let text: string;
  try {
    text = await res.text();
  } catch {
    throw cold({ code: 'NETWORK', message: 'Нет связи с таблицей' });
  }
  // Выключатель API на сервере: вместо JSON — просто «ok». Так же бывает на холодном старте — чтение повторится раз.
  if (text.trim().toLowerCase() === 'ok') {
    throw cold({ code: 'DISABLED', message: 'Связь сайта с таблицей сейчас выключена — работайте в таблице или через бота' });
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    // Не JSON: страница входа Google, 404 развёртывания на холодном старте, обрыв посреди ответа.
    throw cold({ code: 'SERVER', message: 'Таблица ответила непонятно — попробуйте ещё раз' });
  }
  if (!json || typeof json !== 'object' || !('ok' in json)) {
    throw cold({ code: 'SERVER', message: 'Таблица ответила непонятно — попробуйте ещё раз' });
  }
  const env = json as { ok: boolean; error?: ServerError; current?: unknown };
  if (!env.ok) {
    const err = env.error ?? { code: 'SERVER', message: 'Таблица не ответила — попробуйте ещё раз' };
    throw new ApiError(err, env.current);
  }
  return json as Envelope<T>;
}
