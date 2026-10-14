// Интерфейс данных кабинета — тот же, что будет у JSON-API в Apps Script (контракт: docs/api-contract.md, этап 3).
// Сейчас его реализует fakeServer.ts (выдуманная «таблица»); на этапе 4 — живой адаптер. Экраны знают только это.
import type { Activity, Client, Deadline, Payment } from './types';

/** Снимок данных при открытии кабинета. cursor — номер последнего изменения в таблице (выдаёт сервер, не часы браузера). */
export interface Snapshot {
  clients: Client[];
  deadlines: Deadline[];
  payments: Payment[];
  activity: Activity[];
  cursor: number;
}

export type Entity = 'client' | 'deadline' | 'payment' | 'activity';

/** Одно изменение в таблице после курсора: запись появилась/изменилась или удалена (закрыта). */
export interface Change {
  cursor: number;
  entity: Entity;
  op: 'upsert' | 'delete';
  id: string;
  record?: Client | Deadline | Payment | Activity;
  /** Откуда изменение: requestId записи с этого сайта, или 'таблица' / 'бот'. */
  origin: string;
}

/** Запись с сайта. requestId создаёт браузер: повтор из очереди с тем же requestId не создаёт дубль. */
export type WriteOp =
  | { kind: 'closeDeadline'; requestId: string; id: string; baseVersion: number }
  | { kind: 'reopenDeadline'; requestId: string; id: string; undoOf: string }
  | { kind: 'addPayment'; requestId: string; payment: Payment }
  | { kind: 'cancelPayment'; requestId: string; id: string }
  | { kind: 'addClient'; requestId: string; client: Client }
  | { kind: 'updateClient'; requestId: string; id: string; baseVersion: number; patch: Partial<Pick<Client, 'phone' | 'bank' | 'keyUntil'>> };

export type ErrorCode = 'NETWORK' | 'CONFLICT' | 'PERIOD_OPEN' | 'NOT_FOUND' | 'SERVER' | 'AUTH';

export type WriteResult =
  | { ok: true; changes: Change[]; cursor: number }
  | { ok: false; code: ErrorCode; message: string; current?: Client | Deadline };

export interface CabinetApi {
  snapshot(): Promise<Snapshot>;
  changesSince(cursor: number): Promise<{ changes: Change[]; cursor: number }>;
  /** Ответ приходит только после записи в таблицу и логики системы (автоцикл, пересчёт ЄП, аудит). */
  write(op: WriteOp): Promise<WriteResult>;
}

export function newRequestId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `r${Date.now()}${Math.random().toString(16).slice(2)}`;
}
