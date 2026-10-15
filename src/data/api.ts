// Интерфейс данных кабинета — тот же, что будет у JSON-API в Apps Script (контракт: docs/api-contract.md, этап 3).
// Сейчас его реализует fakeServer.ts (выдуманная «таблица»); на этапе 4 — живой адаптер. Экраны знают только это.
import type { Activity, Client, Deadline, DeadlineStatus, Payment, Question, Task } from './types';

/** Снимок данных при открытии кабинета. cursor — номер последнего изменения в таблице (выдаёт сервер, не часы браузера). */
export interface Snapshot {
  clients: Client[];
  deadlines: Deadline[];
  payments: Payment[];
  activity: Activity[];
  tasks: Task[];
  /** Открытые вопросы маме (контракт v2.1, у. 6). */
  questions: Question[];
  cursor: number;
}

export type Entity = 'client' | 'deadline' | 'payment' | 'activity' | 'task' | 'question';

/** Одно изменение в таблице после курсора: запись появилась/изменилась или удалена (закрыта). */
export interface Change {
  cursor: number;
  entity: Entity;
  op: 'upsert' | 'delete';
  id: string;
  record?: Client | Deadline | Payment | Activity | Task | Question;
  /** Откуда изменение: requestId записи с этого сайта, или 'таблица' / 'бот'. */
  origin: string;
}

/** Запись с сайта. requestId создаёт браузер: повтор из очереди с тем же requestId не создаёт дубль. */
export type WriteOp =
  | { kind: 'closeDeadline'; requestId: string; id: string; baseVersion: number }
  | { kind: 'reopenDeadline'; requestId: string; id: string; undoOf: string }
  | { kind: 'addPayment'; requestId: string; payment: Payment }
  | { kind: 'cancelPayment'; requestId: string; id: string; baseVersion: number }
  | { kind: 'addClient'; requestId: string; client: Client }
  | { kind: 'updateClient'; requestId: string; id: string; baseVersion: number; patch: Partial<Pick<Client, 'phone' | 'email' | 'keyIssuer' | 'keyFrom' | 'keyUntil'>> }
  /** deadlines.update (контракт 8.3): дата, статус (кроме done — закрытие только close), заметка. */
  | { kind: 'updateDeadline'; requestId: string; id: string; baseVersion: number; patch: DeadlinePatch }
  | { kind: 'createTask'; requestId: string; task: Task }
  | { kind: 'completeTask'; requestId: string; id: string; done: boolean }
  | { kind: 'answerQuestion'; requestId: string; id: string; text: string };

export type ErrorCode = 'NETWORK' | 'CONFLICT' | 'PERIOD_OPEN' | 'NOT_FOUND' | 'SERVER' | 'VALIDATION' | 'UNDO_TOO_LATE'
  | 'DUPLICATE' | 'BUSY' | 'MAINTENANCE' | 'QUOTA' | 'RATE_LIMIT' | 'AUTH_EXPIRED' | 'AUTH_REQUIRED' | 'FORBIDDEN';

/** Коды, при которых сайт повторяет запись из очереди сам, с паузой (контракт v2.1, раздел 9).
 *  RATE_LIMIT у входа и показа пароля не повторяется — они не идут через очередь (уточнение 10). */
export const RETRYABLE: ReadonlySet<ErrorCode> = new Set<ErrorCode>(['NETWORK', 'BUSY', 'MAINTENANCE', 'QUOTA', 'RATE_LIMIT', 'AUTH_EXPIRED']);

export type WriteResult =
  | { ok: true; changes: Change[]; cursor: number;
      /** Закрытие срока: когда уйдут уведомления (через 2 мин); null — у клиента нет Telegram, уведомления не будет. */
      notifyAt?: string | null }
  | { ok: false; code: ErrorCode; message: string; current?: Client | Deadline | Payment | Question;
      /** MAINTENANCE: когда ночные задачи закончатся (флаг сервера, не часы) — раньше не повторять. */
      retryAt?: string };

export interface DeadlinePatch { due?: string; status?: Exclude<DeadlineStatus, 'done'>; note?: string }

export interface CabinetApi {
  snapshot(): Promise<Snapshot>;
  changesSince(cursor: number): Promise<{ changes: Change[]; cursor: number }>;
  /** Ответ приходит только после записи в таблицу и логики системы (автоцикл, пересчёт ЄП, аудит). */
  write(op: WriteOp): Promise<WriteResult>;
  /** payments.list — месяц вне снимка (снимок держит 90 дней). month: «2026-06». */
  listPayments(month: string): Promise<{ payments: Payment[]; totalKopecks: number }>;
  /** questions.list — открытые вопросы без перезагрузки снимка. */
  listQuestions(): Promise<Question[]>;
}

export function newRequestId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `r${Date.now()}${Math.random().toString(16).slice(2)}`;
}
