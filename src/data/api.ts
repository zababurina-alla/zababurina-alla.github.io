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
  | { kind: 'updateClient'; requestId: string; id: string; baseVersion: number; patch: ClientPatch }
  /** deadlines.update (контракт 8.3): дата, статус (кроме done — закрытие только close), заметка. */
  | { kind: 'updateDeadline'; requestId: string; id: string; baseVersion: number; patch: DeadlinePatch }
  /** deadlines.updateMany (v5.89): до 20 сроков, один patch; ошибка одного — в failed (с current), остальные изменены. */
  | { kind: 'updateDeadlines'; requestId: string; items: { id: string; baseVersion: number }[]; patch: DeadlinePatch }
  | { kind: 'createTask'; requestId: string; task: Task }
  /** consultations.create: id = requestId — сервер (v5.87) даёт записи тот же id. */
  | { kind: 'createConsultation'; requestId: string; consultation: Consultation }
  | { kind: 'completeTask'; requestId: string; id: string; done: boolean }
  /** tasks.completeMany (v5.89): до 20 задач одним запросом; ошибка одной — в failed, остальные сделаны. */
  | { kind: 'completeTasks'; requestId: string; ids: string[]; done: boolean }
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
  | { ok: false; code: ErrorCode; message: string; retryable?: boolean; current?: Client | Deadline | Payment | Question | InboxItem | Task;
      /** MAINTENANCE: когда ночные задачи закончатся (флаг сервера, не часы) — раньше не повторять. */
      retryAt?: string };

/** tasks.update: что поменять; null очищает срок или клиента. Сделанную задачу сервер править не даёт. */
export interface TaskPatch { text?: string; due?: string | null; type?: TaskType; priority?: Priority; clientId?: string | null }

/** clients.update: контакты, ключ; kved — весь список кодов «NN.NN» (заменяет; главный сервер выбирает сам). */
export type ClientPatch = Partial<Pick<Client, 'phone' | 'email' | 'keyIssuer' | 'keyFrom' | 'keyUntil'>> & { kved?: string[] };

export interface DeadlinePatch { due?: string; status?: Exclude<DeadlineStatus, 'done'>; note?: string }

/** clients.get — всё о клиенте: строка целиком, его сроки, платежи (не только 90 дней), задачи и история изменений. */
export interface ClientCard { client: Client; deadlines: Deadline[]; payments: Payment[]; tasks: Task[]; history: Activity[]; consultations: Consultation[] }

/** clients.remind — напоминание клиенту в Telegram. text — ровно то, что мама видела в превью и отправила. */
/** Какие записи (сущность и id) трогает запись в очереди: пока она не решена, изменения журнала по ним не применяются —
 *  иначе прежнее «записано» / «закрыто» из журнала перекрывает «Отменить» на экране (приёмка-5, Р-7: строка мигала). */
export function touchedBy(op: WriteOp): [Entity, string][] {
  switch (op.kind) {
    case 'closeDeadline': case 'reopenDeadline': case 'updateDeadline': return [['deadline', op.id]];
    case 'closeDeadlines': case 'updateDeadlines': return op.items.map((i) => ['deadline', i.id] as [Entity, string]);
    case 'addPayment': return [['payment', op.payment.id]];
    case 'cancelPayment': return [['payment', op.id]];
    case 'addClient': return [['client', op.client.id]];
    case 'updateClient': return [['client', op.id]];
    case 'createTask': return [['task', op.task.id]];
    case 'updateTask': case 'deleteTask': case 'completeTask': return [['task', op.id]];
    case 'completeTasks': return op.ids.map((id) => ['task', id] as [Entity, string]);
    case 'createConsultation': return [['consultation', op.consultation.id]];
    case 'answerQuestion': return [['question', op.id]];
    case 'decideInbox': return [['inbox', op.id]];
  }
}

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

/** Шаблоны сроков таблицы (меню «📋 Шаблоны сроков», deadlines.applyTemplate v5.88). */
export const DEADLINE_TEMPLATES = ['FOP1', 'FOP2', 'FOP3', 'FOP_GENERAL', 'TOV_SIMPLE', 'TOV_GENERAL', 'INDIVIDUAL', 'NONRESIDENT', 'LAND_RENT', 'EXCISE', 'HIRED_WORKERS'] as const;
export type DeadlineTemplate = typeof DEADLINE_TEMPLATES[number];
/** Пробный прогон: что добавится и что у клиента уже есть (ничего не пишет). */
export interface TemplatePreview { template: DeadlineTemplate; wouldAdd: { obligation: string; periodicity: Deadline['periodicity']; due: string }[]; skipped: string[] }
export type ApplyTemplateResult =
  | { ok: true; template: DeadlineTemplate; added: Deadline[]; skipped: string[] }
  | { ok: false; code: ErrorCode; message: string; field: string | null };

/** clients.botLink: подключён — ссылки нет; иначе одноразовая ссылка /start client_… на 7 дней (каждый вызов — новая). */
export interface BotLinkResult { connected: boolean; link: string | null; expiresAt: string | null }

/** clients.statementPdf: ссылка на новый PDF в Drive (каждый вызов — новый файл). */
export interface StatementPdf { url: string; fileName: string }
/** clients.sendStatement превью: подпись на языке клиента; нет бота / тестовый — preview null и причина. */
export interface StatementPreview { preview: string | null; reason: 'noBot' | 'test' | null; message: string | null }
/** clients.sendStatement отправка — как RemindResult (лимит 12 ч на клиента — общий с напоминаниями). */
export type StatementResult = RemindResult;

/** deadlines.listArchive: «🗄 Архив сроков» клиента, новые первыми; только просмотр (version нет, у старых строк id null). */
export interface ArchivedDeadline { id: string | null; what: string; periodicity: Deadline['periodicity']; due: string | null; periodEnd: string | null;
  /** 'archived' — «не требуется» (v5.96.2: перенесён в архив со статусом «Новое» и заметкой), причина — в reason. */
  status: Deadline['status'] | 'archived'; reason: string | null; closedAt: string | null; archivedAt: string | null }
export interface ArchivePage { items: ArchivedDeadline[]; total: number; more: boolean }
/** reports.attention: клиенты по баллу риска (как бот «внимание»): high ≥ 60, mid ≥ 30; factors с weight 0 — пометки. */
export interface AttentionItem { clientId: string; name: string; score: number; level: 'high' | 'mid' | 'low'; factors: { label: string; weight: number }[] }

/** Лист «🗓 Месяц» (v5.90): чек-лист по клиентам со штатом, только текущий месяц. */
export const MONTH_CHECKS = ['advance', 'advanceTax', 'salary', 'salaryTax', 'timesheet', 'payroll', 'report'] as const;
export type MonthCheck = typeof MONTH_CHECKS[number];
export interface MonthItem { clientId: string | null; name: string; period: string; status: string | null; comment: string | null; percent: number; checks: Record<MonthCheck, boolean> }
export interface MonthSheet { period: string | null; items: MonthItem[] }

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
  /** deadlines.applyTemplate: без requestId — пробный прогон (dryRun), с ним — запись. template не передан — по системе
   *  клиента (это же «🔁 Пересчитать сроки»). Существующие сроки сервер не трогает. */
  previewTemplate(clientId: string, template?: DeadlineTemplate): Promise<TemplatePreview | { ok: false; code: ErrorCode; message: string; field: string | null }>;
  applyTemplate(clientId: string, template: DeadlineTemplate | undefined, requestId: string): Promise<ApplyTemplateResult>;
  /** Без requestId (токен — ключ входа, в листы не пишется). Ошибки — ApiError. */
  clientBotLink(clientId: string): Promise<BotLinkResult>;
  /** Чтение, по кнопке «Показать архив» — не на каждый показ карточки. */
  listArchive(clientId: string, offset?: number, limit?: number): Promise<ArchivePage>;
  /** Чтение трёх листов — не чаще раза в несколько минут. */
  attention(limit?: number): Promise<AttentionItem[]>;
  /** «🗓 Месяц»: чтение и галочка (без requestId — ставит значение, повтор безопасен). */
  monthGet(): Promise<MonthSheet>;
  monthSet(clientId: string, item: MonthCheck, done: boolean): Promise<MonthItem>;
  /** Без requestId, собирается несколько секунд. В PDF есть логин клиента (не пароль) — как в меню таблицы. */
  statementPdf(clientId: string): Promise<StatementPdf>;
  statementPreview(clientId: string): Promise<StatementPreview>;
  /** С requestId: повтор не шлёт второй раз. */
  sendStatement(clientId: string, requestId: string): Promise<StatementResult>;
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
