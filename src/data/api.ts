// Интерфейс данных кабинета — тот же, что будет у JSON-API в Apps Script (контракт: docs/api-contract.md, этап 3).
// Сейчас его реализует fakeServer.ts (выдуманная «таблица»); на этапе 4 — живой адаптер. Экраны знают только это.
import type { Activity, Client, Consultation, Deadline, DeadlineStatus, InboxItem, KvedItem, Payment, Priority, Question, Rates, Task, TaskType } from './types';

/** Снимок данных при открытии кабинета. cursor — номер последнего изменения в таблице (выдаёт сервер, не часы браузера). */
export interface Snapshot {
  clients: Client[];
  deadlines: Deadline[];
  payments: Payment[];
  activity: Activity[];
  tasks: Task[];
  /** Открытые вопросы маме (контракт v2.1, у. 6). */
  questions: Question[];
  /** «Входящие» — пусто, пока сервер их не отдаёт. */
  inbox: InboxItem[];
  /** Консультации за 90 дней (v5.87). */
  consultations?: Consultation[];
  /** Сервер не успел собрать консультации — свой список не затирать. */
  consultationsSkipped?: boolean;
  cursor: number;
}

export type Entity = 'client' | 'deadline' | 'payment' | 'activity' | 'task' | 'question' | 'inbox' | 'consultation';

/** Одно изменение в таблице после курсора: запись появилась/изменилась или удалена (закрыта). */
export interface Change {
  cursor: number;
  entity: Entity;
  op: 'upsert' | 'delete';
  id: string;
  record?: Client | Deadline | Payment | Activity | Task | Question | InboxItem | Consultation;
  /** Откуда изменение: requestId записи с этого сайта, или 'таблица' / 'бот'. */
  origin: string;
}

/** Запись с сайта. requestId создаёт браузер: повтор из очереди с тем же requestId не создаёт дубль. */
export type WriteOp =
  | { kind: 'closeDeadline'; requestId: string; id: string; baseVersion: number }
  | { kind: 'updateTask'; requestId: string; id: string; baseVersion: number; patch: TaskPatch }
  | { kind: 'deleteTask'; requestId: string; id: string; baseVersion: number }
  /** deadlines.closeMany: 1…20 сроков одним запросом; отказ по одному — в failed, остальные закрываются. */
  | { kind: 'closeDeadlines'; requestId: string; items: { id: string; baseVersion: number }[] }
  | { kind: 'reopenDeadline'; requestId: string; id: string; undoOf: string }
  | { kind: 'addPayment'; requestId: string; payment: Payment }
  | { kind: 'cancelPayment'; requestId: string; id: string; baseVersion: number }
  | { kind: 'addClient'; requestId: string; client: Client }
  | { kind: 'updateClient'; requestId: string; id: string; baseVersion: number; patch: Partial<Pick<Client, 'phone' | 'email' | 'keyIssuer' | 'keyFrom' | 'keyUntil'>> }
  /** deadlines.update (контракт 8.3): дата, статус (кроме done — закрытие только close), заметка. */
  | { kind: 'updateDeadline'; requestId: string; id: string; baseVersion: number; patch: DeadlinePatch }
  | { kind: 'createTask'; requestId: string; task: Task }
  /** consultations.create: id = requestId — сервер (v5.87) даёт записи тот же id. */
  | { kind: 'createConsultation'; requestId: string; consultation: Consultation }
  | { kind: 'completeTask'; requestId: string; id: string; done: boolean }
  | { kind: 'answerQuestion'; requestId: string; id: string; text: string }
  /** inbox.decide: принять (платёж — записать с суммой), сделать задачей, отклонить. */
  | { kind: 'decideInbox'; requestId: string; id: string; action: InboxAction; amount?: number };

export type ErrorCode = 'NETWORK' | 'CONFLICT' | 'PERIOD_OPEN' | 'NOT_FOUND' | 'SERVER' | 'VALIDATION' | 'UNDO_TOO_LATE'
  | 'DUPLICATE' | 'BUSY' | 'MAINTENANCE' | 'QUOTA' | 'RATE_LIMIT' | 'AUTH_EXPIRED' | 'AUTH_REQUIRED' | 'FORBIDDEN';

/** Коды, при которых сайт повторяет запись из очереди сам, с паузой (контракт v2.1, раздел 9).
 *  RATE_LIMIT у входа и показа пароля не повторяется — они не идут через очередь (уточнение 10). */
export const RETRYABLE: ReadonlySet<ErrorCode> = new Set<ErrorCode>(['NETWORK', 'BUSY', 'MAINTENANCE', 'QUOTA', 'RATE_LIMIT', 'AUTH_EXPIRED']);

export type WriteResult =
  | { ok: true; changes: Change[]; cursor: number;
      /** Закрытие срока: когда уйдут уведомления (через 2 мин); null — у клиента нет Telegram, уведомления не будет. */
      notifyAt?: string | null;
      /** closeMany: сроки, которые не закрылись (PERIOD_OPEN / CONFLICT / NOT_FOUND), — остальные закрыты. */
      failed?: { id: string; code: ErrorCode; message: string; current?: Deadline }[];
      /** closeMany: какой следующий срок создан для какого закрытого (у следующего квартала другое название). */
      nextOf?: Record<string, string | null> }
  | { ok: false; code: ErrorCode; message: string; current?: Client | Deadline | Payment | Question | InboxItem | Task;
      /** MAINTENANCE: когда ночные задачи закончатся (флаг сервера, не часы) — раньше не повторять. */
      retryAt?: string };

/** tasks.update: что поменять; null очищает срок или клиента. Сделанную задачу сервер править не даёт. */
export interface TaskPatch { text?: string; due?: string | null; type?: TaskType; priority?: Priority; clientId?: string | null }

export interface DeadlinePatch { due?: string; status?: Exclude<DeadlineStatus, 'done'>; note?: string }

/** clients.get — всё о клиенте: строка целиком, его сроки, платежи (не только 90 дней), задачи и история изменений. */
export interface ClientCard { client: Client; deadlines: Deadline[]; payments: Payment[]; tasks: Task[]; history: Activity[]; consultations: Consultation[] }

/** clients.remind — напоминание клиенту в Telegram. text — ровно то, что мама видела в превью и отправила. */
export interface RemindRequest { clientId: string; kind: 'deadline' | 'key' | 'docs' | 'custom'; deadlineId?: string; period?: string; text: string }
/** Ушло; не ушло (нет бота / тестовый режим); неизвестно — проверить в Telegram; рано — «12 ч на клиента и повод». */
export type RemindResult =
  | { sent: true; sentAt: string | null; preview: string | null }
  | { sent: false; reason: 'noBot' | 'test' | 'unknown' | 'rateLimit'; message: string; retryAt?: string };

/** deadlines.create (v5.88, «➕ Новый срок»). periodEnd сервер считает сам — его не передаём. */
export interface NewDeadline { clientId: string; obligation: string; due: string; periodicity: Deadline['periodicity']; note: string }
/** Создан; отказ — с полем (VALIDATION) или с уже открытым сроком того же обязательства (CONFLICT, current). */
export type CreateDeadlineResult =
  | { ok: true; deadline: Deadline }
  | { ok: false; code: ErrorCode; message: string; field: string | null; current: Deadline | null };

/** deadlines.cancelNotify: сообщение клиенту о закрытии снято (срок остаётся закрытым); снимать было нечего;
 *  уже забрано на отправку (sentAt — примерно когда ушло). */
export type CancelNotifyResult = { status: 'cancelled' } | { status: 'nothing' } | { status: 'sent'; sentAt: string | null };

/** Пробный прогон: текст на языке клиента; для «нет бота» / тестового клиента — preview null и причина. */
export interface RemindPreview { preview: string | null; lang: string | null; reason: 'noBot' | 'test' | null; message: string | null }

/** Ответ поиска КВЕД. note — пояснение сервера, когда не нашлось («не установлена радою»). */
/** inbox.decide: записать (платёж — с суммой), задача, отклонить, задача по налогу (статус сообщения не меняется). */
export type InboxAction = 'accept' | 'task' | 'reject' | 'taxTask';

export interface KvedFound { items: KvedItem[]; note: string | null }

/** reference.kved { all:true } — весь лист «📑 КВЕДы» (~217 строк): ищем в браузере. */
export interface KvedAll { items: KvedItem[]; councilDecision: string | null; updatedAt: string | null }

export interface CabinetApi {
  snapshot(): Promise<Snapshot>;
  changesSince(cursor: number): Promise<{ changes: Change[]; cursor: number }>;
  /** Ответ приходит только после записи в таблицу и логики системы (автоцикл, пересчёт ЄП, аудит). */
  write(op: WriteOp): Promise<WriteResult>;
  /** payments.list — месяц вне снимка (снимок держит 90 дней). month: «2026-06». */
  listPayments(month: string): Promise<{ payments: Payment[]; totalKopecks: number }>;
  /** questions.list — открытые вопросы без перезагрузки снимка. */
  listQuestions(): Promise<Question[]>;
  /** clients.remind — мимо очереди: результат нужен сразу, повтор не должен отправить сообщение дважды (requestId). */
  remindClient(req: RemindRequest, requestId: string): Promise<RemindResult>;
  /** clients.remind { preview:true } — текст сообщения на языке клиента, без отправки и без расхода лимита. */
  remindPreview(req: Omit<RemindRequest, 'text'>): Promise<RemindPreview>;
  cancelNotify(deadlineId: string, requestId: string): Promise<CancelNotifyResult>;
  /** Мимо очереди, с requestId: ответ нужен сразу (CONFLICT — «уже есть такой срок, открыть?»); повтор тем же
   *  requestId сервер не задвоит. */
  createDeadline(d: NewDeadline, requestId: string): Promise<CreateDeadlineResult>;
  /** clients.get — карточка целиком (п. 3) и история изменений клиента (п. 9). */
  clientCard(id: string): Promise<ClientCard>;
  /** reference.rates — ставки года из «⚙️ Справочники». Цифр ставок в коде сайта нет. */
  referenceRates(year?: number): Promise<Rates>;
  /** reference.kved — поиск по коду или словам, до 20 строк. */
  referenceKved(q: string): Promise<KvedFound>;
  /** reference.kved { all:true } — весь лист одним ответом. */
  referenceKvedAll(): Promise<KvedAll>;
}

export function newRequestId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `r${Date.now()}${Math.random().toString(16).slice(2)}`;
}
