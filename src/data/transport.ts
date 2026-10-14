// Транспорт к Apps Script по контракту (docs/api-contract.md, раздел 2): один адрес, POST text/plain без своих
// заголовков (иначе браузер шлёт preflight, а Apps Script его не обслуживает), ответ всегда HTTP 200 с ok/error в теле.
// Таймаут 30 с. Ничего не логирует: в теле бывают сеанс, ID-токен и (у revealPassword) пароль.
import type { ErrorCode } from './api';

export const TIMEOUT_MS = 30_000;

export interface Envelope<T> {
  ok: true;
  data: T;
  cursor: number;
  serverTime?: string;
}

export interface ServerError {
  code: ErrorCode | 'AUTH_INVALID' | 'CURSOR_EXPIRED' | 'UNSUPPORTED_VERSION';
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
  constructor(err: ServerError, current?: unknown) {
    super(err.message);
    this.name = 'ApiError';
    this.code = err.code;
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

export async function call<T>({ url, action, payload = {}, session, requestId, fetchImpl = fetch, timeoutMs = TIMEOUT_MS }: CallArgs): Promise<Envelope<T>> {
  const body: Record<string, unknown> = { v: 1, action, payload };
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
    throw new ApiError({ code: 'NETWORK', message: 'Нет связи с таблицей' });
  } finally {
    clearTimeout(timer);
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    // Не JSON: страница входа Google, ошибка развёртывания, обрыв посреди ответа.
    throw new ApiError({ code: 'SERVER', message: 'Таблица ответила непонятно — попробуйте ещё раз' });
  }
  if (!json || typeof json !== 'object' || !('ok' in json)) {
    throw new ApiError({ code: 'SERVER', message: 'Таблица ответила непонятно — попробуйте ещё раз' });
  }
  const env = json as { ok: boolean; error?: ServerError; current?: unknown };
  if (!env.ok) {
    const err = env.error ?? { code: 'SERVER', message: 'Таблица не ответила — попробуйте ещё раз' };
    throw new ApiError(err, env.current);
  }
  return json as Envelope<T>;
}
