// Состояние экранов поверх API. Таблица — источник правды: экран показывает снимок таблицы плюс
// ещё не подтверждённые записи (с пометкой «сохраняется» / «ждёт связи» / «не сохранилось»).
// Каждое действие — запись в очередь (outbox.ts) → api.write → ответ сервера с изменениями → экран.
// Обратно: изменения из таблицы и бота приходят по курсору (changesSince) — при открытии, при возврате во
// вкладку и раз в 30 с (бриф, п. 6).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { fakeServer } from './fakeServer';
import { api, liveApi } from './session';
import { ApiError } from './transport';
import { canWrite, hasFeature, isLive } from '../config';
import { roMessage } from '../ui/readonly';
import type { WriteArea } from '../config';
import { kvAll, kvDelete, kvSet } from './idb';
import { readSnap, readSnapAt, saveSnap } from './snapCache';
import { Outbox } from './outbox';
import type { Counters, OutboxEvent, OutboxItem } from './outbox';
import { newRequestId, touchedBy } from './api';
import type { AiAnswer, ApplyTemplateResult, BotLinkResult, CabinetApi, MonthCheck, StatementPdf, StatementPreview, StatementResult, CancelNotifyResult, Change, CreateDeadlineResult, DeadlineTemplate, NewDeadline, DeadlinePatch, InboxAction, PaymentPatch, RemindPreview, RemindRequest, RemindResult, Snapshot, TaskPatch, WriteOp, WriteResult } from './api';
import type { Activity, Client, Consultation, DatedDeadline, Deadline, IncomeBasis, InboxItem, Payment, Question, SaveState, Task } from './types';
import { isDated } from './types';
import { TODAY, addDays, fmtDate, plural } from '../lib/dates';
import { play } from '../lib/sound';
import { threadKey } from '../lib/inboxThreads';
import { setPhotos } from '../ui/photo';

// Опрос изменений из таблицы: бриф — раз в 30–60 с. Квоты Apps Script дневного лимита на запросы не задают
// (developers.google.com/apps-script/guides/services/quotas), но одновременных выполнений — 30 на владельца.
const POLL_MS = 30_000;
const FRESH_MS = 2600;
/** Окно «Отменить» до отправки для решений, которые сервер вернуть не умеет; столько же живёт уведомление. */
export const HOLD_MS = 10_000;

export type CloseResult = { ok: true } | { ok: false; reason: string };
export type ExternalKind = 'payment' | 'key' | 'close' | 'phone' | 'inbox';

/** Окончательный отказ таблицы (повтор не поможет): маме — что случилось, её словами. */
/** info — подсказка (раздел пока только для просмотра): спокойная, уходит сама, одна на раздел. */
export interface Notice { id: string; text: string; info?: boolean; key?: string; /** «Открыть» в уведомлении — куда перейти. */ href?: string }

export interface Conflict {
  requestId: string;
  clientId: string;
  mine: string;
  theirs: string;
}

/** batch — закрыт пакетом (closeMany): requestId общий у всех сроков пакета. */
export interface ClosedEntry { deadline: Deadline; next: Deadline | null; save: SaveState; requestId: string; by: 'сайт' | 'бот'; batch?: boolean }
/** Что сервер сказал о записи, кроме изменений: когда уйдут уведомления, что из пакета не закрылось. */
type Applied = Pick<Extract<WriteResult, { ok: true }>, 'notifyAt' | 'failed' | 'nextOf'>;

interface Store {
  loaded: boolean;
  online: boolean;
  /** Когда данные на экране последний раз сошлись с таблицей (мс); null — ещё ни разу. */
  syncedAt: number | null;
  clients: Client[];
  /** Открытые сроки с датой — раскладываются по дням. */
  deadlines: DatedDeadline[];
  /** Открытые сроки без даты (пусто в таблице) — показываются отдельно: «проверьте в таблице». */
  undated: Deadline[];
  payments: Payment[];
  activity: Activity[];
  tasks: Task[];
  questions: Question[];
  /** «Входящие» — сообщения клиентов из Telegram, превращённые в предложения. */
  inbox: InboxItem[];
  /** Консультации за 90 дней (снимок) и подгруженные карточкой; свежие сверху. */
  consultations: Consultation[];
  notices: Notice[];
  /** Таблица не отдала данные при открытии (живой режим): текст для мамы; null — всё в порядке. */
  loadError: string | null;
  /** Экраны показывают снимок из прошлой загрузки вкладки (sessionStorage), свежий ещё идёт. */
  stale: boolean;
  reload: () => void;
  closed: ClosedEntry[];
  fresh: string[];
  pending: OutboxItem[];
  counters: Counters;
  cursor: number;
  conflict: Conflict | null;
  client: (id: string) => Client | undefined;
  /** hideAfterMs — убрать строку с экрана не сразу (успеть показать анимацию); в очередь запись встаёт сразу. */
  closeDeadline: (id: string, onSaved?: (next: Deadline | null, notifyAt: string | null) => void, hideAfterMs?: number) => CloseResult;
  /** Закрыть несколько сроков (deadlines.closeMany по 20). skipped — у кого период не закончился (не отправлены). */
  closeDeadlines: (ids: string[], onDone?: (closed: number, failed: { what: string; message: string }[]) => void) => { sent: number; skipped: { id: string; what: string; message: string }[] };
  reopenDeadline: (id: string) => void;
  addPayment: (p: Omit<Payment, 'id' | 'version' | 'source' | 'save'>, onSaved?: () => void) => string;
  removePayment: (id: string) => void;
  /** Дописать дату и/или сумму платежу (payments.update, флаг paymentsFill): только в пустую ячейку; запись — в очередь. */
  updatePayment: (id: string, patch: PaymentPatch, label: string) => void;
  addClient: (c: Omit<Client, 'id' | 'version'>, onSaved?: (created: Deadline[], client: Client) => void) => Client;
  /** baseVersion — версия, которую мама видела, когда начала править (бриф, п. 6: конфликт). */
  updatePhone: (clientId: string, phone: string, baseVersion: number) => void;
  /** КВЕД клиента целиком (clients.update patch.kved); главный — выберет сервер по max ставке. */
  updateKved: (clientId: string, codes: string[], baseVersion: number) => void;
  /** Доход клиента (clients.update { income }, флаг incomeEdit): на экране — «сохраняется…» из очереди, значение встаёт по ответу таблицы. */
  updateIncome: (clientId: string, income: { amountKopecks: number; basis: IncomeBasis }, baseVersion: number) => void;
  /** Почта клиента (clients.update { email }). */
  updateEmail: (clientId: string, email: string, baseVersion: number) => void;
  addTask: (t: Omit<Task, 'id' | 'version' | 'done'>) => void;
  /** consultations.create: на экране сразу («сохраняется…»), id заменит ответ сервера. */
  addConsultation: (k: { clientId: string; topic: string; minutes: number | null; note: string }) => void;
  /** Срок: в работе / ожидание / отложить до / перенести дату (deadlines.update). */
  updateDeadline: (id: string, patch: DeadlinePatch, label: string) => void;
  /** Ключ ЭЦП продлён: новый срок, дата выпуска и кто выдал (clients.update). */
  renewKey: (clientId: string, keyUntil: string, keyFrom: string | null, keyIssuer: string | null) => void;
  /** Платежи месяца вне снимка (payments.list): дозагружает в общий список. Возвращает итог «получено» сервера. */
  loadPaymentsMonth: (month: string) => Promise<number>;
  /** Открытые вопросы заново (questions.list) — без перезагрузки снимка. */
  refreshQuestions: () => Promise<void>;
  /** Решение по сообщению из «Входящих» (inbox.decide). amount — копейки, если мама поправила сумму. */
  /** Возвращает requestId: «Нет» ждёт 10 с в окне «Отменить» (undoHeld), остальное уходит сразу. */
  decideInbox: (id: string, action: InboxAction, amount?: number) => string;
  /** «Отменить» в окне 10 с (ответ на вопрос, «Нет» во «Входящих»): запись не уходит, на экране — как было.
   *  false — окно кончилось, запись уже в таблице. */
  undoHeld: (requestId: string) => Promise<boolean>;
  /** clients.remind — напомнить клиенту в Telegram (под writes.deadlines). Ответ — сразу, мимо очереди. */
  remindClient: (req: RemindRequest) => Promise<RemindResult>;
  /** «➕ Новый срок» (deadlines.create v5.88). null — сервер ещё не умеет (флаг deadlinesCreate) или запись сроков выключена. */
  createDeadline: ((d: NewDeadline, requestId: string) => Promise<CreateDeadlineResult>) | null;
  /** «📋 Шаблон сроков» / «🔁 Пересчитать сроки» (deadlines.applyTemplate). null — нет флага applyTemplate или запись сроков выключена. */
  templates: {
    preview: CabinetApi['previewTemplate'];
    apply: (clientId: string, template: DeadlineTemplate | undefined, requestId: string) => Promise<ApplyTemplateResult>;
  } | null;
  /** Выписка клиента: PDF (флаг statementPdf) и отправка в Telegram (флаг sendStatement + запись remind). null — нельзя. */
  statement: {
    pdf: ((clientId: string) => Promise<StatementPdf>) | null;
    preview: ((clientId: string) => Promise<StatementPreview>) | null;
    send: ((clientId: string) => Promise<StatementResult>) | null;
  };
  /** «🗓 Месяц» (флаг month): чтение; галочка — флаг monthWrite и запись задач (лист ведёт мама, как задачи). */
  month: { get: CabinetApi['monthGet']; set: CabinetApi['monthSet'] | null } | null;
  /** Архив сроков клиента (флаг archive) и «Требуют внимания» (флаг attention) — чтение; null — сервер ещё не умеет. */
  archive: CabinetApi['listArchive'] | null;
  attention: CabinetApi['attention'] | null;
  /** Фото клиентов (clients.photos, флаг photos): id → картинка. Пусто — аватары буквами. Только в памяти вкладки. */
  photos: Readonly<Record<string, string>>;
  /** Помощник (ai.ask, флаг aiChat); null — выключен. */
  aiAsk: ((q: string, clientId: string | null) => Promise<AiAnswer>) | null;
  /** «Удалить» и «Очистить прочитанное» во «Входящих» — только на сайте (флаг inboxHide); null — выключено. */
  inboxHide: { hide: (ids: string[]) => string; clearRead: () => Promise<{ hidden: number; undo: () => void }> } | null;
  /** «Ссылка для бота» (clients.botLink). null — нет флага botLink. */
  botLink: ((clientId: string) => Promise<BotLinkResult>) | null;
  /** «Не писать клиенту» после закрытия срока: срок остаётся закрытым. null — на этом сервере ещё нельзя
   *  (флаг cancelNotify) или запись сроков выключена: кнопку не показывать. */
  cancelCloseNotice: ((deadlineId: string) => Promise<CancelNotifyResult>) | null;
  /** Черновик напоминания от сервера (пробный запуск) — только если сервер это умеет (features: remindPreview). */
  remindPreview: (req: Omit<RemindRequest, 'text'>) => Promise<RemindPreview | null>;
  /** clients.get: карточка целиком — строка клиента, его платежи и задачи дополняют общие списки; история — в ответе. */
  loadClientCard: (id: string) => Promise<Activity[]>;
  /** Поправить задачу (tasks.update): текст, срок, приоритет, тип, клиент; null очищает срок/клиента. */
  updateTask: (id: string, patch: TaskPatch) => void;
  /** Удалить задачу (tasks.delete). «Вернуть» нет — на экране подтверждение перед удалением. */
  deleteTask: (id: string) => void;
  /** Ответ на вопрос маме (questions.answer). */
  /** Ответ ждёт 10 с в окне «Отменить» (undoHeld); возвращает requestId. */
  /** replace: true — заменить уже записанный ответ (флаг answerReplace): сразу, без 10 с; отказ сервера — уведомлением с его текстом. */
  answerQuestion: (id: string, text: string, onSaved?: () => void, replace?: boolean) => string;
  dismissNotice: (id: string) => void;
  toggleTask: (id: string, done: boolean) => void;
  completeTasks: (ids: string[], done: boolean) => void;
  updateDeadlines: (ids: string[], patch: DeadlinePatch, label: string) => void;
  resolveConflict: (keep: 'mine' | 'theirs') => void;
  retry: (requestId: string) => void;
  discard: (requestId: string) => void;
  syncNow: () => Promise<void>;
  /** Пароль от кабинета налоговой: отдельный запрос по явному «Показать», мимо очереди и хранилища. */
  revealPassword: (clientId: string) => Promise<{ login: string; password: string; ttlSeconds: number }>;
  /** Режим отладки: правка «извне» (в таблице или через бота) и рычаги сети. */
  external: (kind: ExternalKind) => string;
  setOnline: (on: boolean) => void;
  failNextWrite: () => void;
  setSlow: (on: boolean) => void;
  setMaintenance: (on: boolean) => void;
}

const Ctx = createContext<Store | null>(null);

// null — запись не по разделу writes, а за своим флагом (скрытие «Входящих» только на сайте — inboxHide).
const AREA_OF: Record<WriteOp['kind'], WriteArea | null> = {
  hideInbox: null, unhideInbox: null,
  createConsultation: 'consultations',
  closeDeadline: 'deadlines', closeDeadlines: 'deadlines', updateTask: 'tasks', deleteTask: 'tasks', reopenDeadline: 'deadlines', addPayment: 'payments', cancelPayment: 'payments', updatePayment: 'payments',
  updateDeadline: 'deadlines', addClient: 'clients', updateClient: 'clients', createTask: 'tasks', completeTask: 'tasks', completeTasks: 'tasks', updateDeadlines: 'deadlines', answerQuestion: 'questions', decideInbox: 'inbox',
};

function upsert<T extends { id: string }>(xs: T[], rec: T): T[] {
  const i = xs.findIndex((x) => x.id === rec.id);
  if (i < 0) return [rec, ...xs];
  const copy = xs.slice();
  copy[i] = rec;
  return copy;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [online, setOnlineState] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [deadlines, setDeadlines] = useState<DatedDeadline[]>([]);
  const [undated, setUndated] = useState<Deadline[]>([]);
  /** Открытый срок — в нужный список: с датой или без. */
  const putOpen = useCallback((d: Deadline) => {
    if (isDated(d)) { setDeadlines((xs) => upsert(xs, d)); setUndated((xs) => xs.filter((x) => x.id !== d.id)); }
    else { setUndated((xs) => upsert(xs, d)); setDeadlines((xs) => xs.filter((x) => x.id !== d.id)); }
  }, []);
  const dropOpen = useCallback((id: string) => {
    setDeadlines((xs) => xs.filter((x) => x.id !== id));
    setUndated((xs) => xs.filter((x) => x.id !== id));
  }, []);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** На экране снимок из прошлой загрузки этой вкладки, свежий ещё не пришёл. */
  const [stale, setStale] = useState(false);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  /** Вопросы, убранные с экрана до ответа сервера, — вернуть, если ответ не записался. */
  const answering = useRef(new Map<string, Question>());
  const [closed, setClosed] = useState<ClosedEntry[]>([]);
  // «Вернуть срок» зовут из уведомления, созданного в момент закрытия: его store видел список «закрыто» ДО этого срока.
  // Поэтому reopenDeadline читает текущий список отсюда, а не из замыкания (находка «Пользователя» № 19).
  const closedRef = useRef<ClosedEntry[]>([]);
  /** Скрытые с сайта сообщения «Входящих» по requestId — для «Отменить» и для возврата при отказе. */
  const hiddenBefore = useRef(new Map<string, InboxItem[]>());
  const deadlinesRef = useRef<DatedDeadline[]>([]);
  const inboxRef = useRef<InboxItem[]>([]);
  /** Записи, показ которых на экране отложен на время анимации: requestId → «показать сейчас». */
  const delayed = useRef(new Map<string, () => void>());
  useEffect(() => { closedRef.current = closed; }, [closed]);
  useEffect(() => { deadlinesRef.current = deadlines; }, [deadlines]);
  useEffect(() => { inboxRef.current = inbox; }, [inbox]);
  const [fresh, setFresh] = useState<string[]>([]);
  const [pending, setPending] = useState<OutboxItem[]>([]);
  const [counters, setCounters] = useState<Counters>({ entered: 0, sent: 0, accepted: 0, rejected: 0, applied: 0, seenInTable: 0 });
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [cursor, setCursor] = useState(0);
  const cursorRef = useRef(0);
  /** Первый снимок пришёл — до этого опрос изменений не идёт (на живой таблице оба запроса тяжёлые, 10–20 с). */
  const snapReady = useRef(false);
  /** Опрос уже идёт / нужен ещё один после текущего: не больше одного sync.changes одновременно. */
  const syncing = useRef(false);
  const syncAgain = useRef(false);
  const mine = useRef(new Set<string>());
  const paymentsRef = useRef<Payment[]>([]);
  useEffect(() => { paymentsRef.current = payments; }, [payments]);
  const callbacks = useRef(new Map<string, (changes: Change[], result: Applied) => void>());
  const outboxRef = useRef<Outbox | null>(null);
  const syncSoon = useRef<number | null>(null);
  const syncRef = useRef<() => Promise<void>>(async () => undefined);
  const handlerRef = useRef<(e: OutboxEvent) => void>(() => undefined);

  const markFresh = useCallback((ids: string[]) => {
    if (!ids.length) return;
    setFresh((xs) => [...xs, ...ids]);
    window.setTimeout(() => setFresh((xs) => xs.filter((x) => !ids.includes(x))), FRESH_MS);
  }, []);

  /** Применить изменения таблицы к экрану. Чужие (из таблицы, бота) — подсветить и тихо звякнуть. */
  /** advance — сдвигать курсор журнала. Ответ на запись курсор не сдвигает: запись могла породить в таблице больше,
   *  чем вернул сервер (строка «Что изменилось», пересчёт системы), — это заберёт следующий опрос по курсору. */
  const applyChanges = useCallback((changes: Change[], advance = true) => {
    const foreign: string[] = [];
    // Записи, по которым в очереди ещё ждёт своя запись (отмена, правка, решение): журнал по ним не применяем — на экране
    // остаётся то, что сделала мама, пока сервер не ответит на её запись (ответ применится сам, отказ вернёт экран).
    // Без этого опрос через 0,8 с приносил прежнее «записано» / «закрыто» и строка мигала (приёмка-5, Р-7).
    const busy = new Set((outboxRef.current?.list() ?? []).flatMap((it) => touchedBy(it.op).map(([e, id]) => `${e}:${id}`)));
    for (const ch of changes) {
      const own = mine.current.has(ch.origin);
      if (own) outboxRef.current?.markSeen(ch.origin); else foreign.push(ch.id);
      if (busy.has(`${ch.entity}:${ch.id}`)) continue;
      if (ch.entity === 'client') {
        if (ch.op === 'delete') setClients((xs) => xs.filter((x) => x.id !== ch.id));
        else setClients((xs) => upsert(xs, ch.record as Client));
      } else if (ch.entity === 'deadline') {
        const rec = ch.record as Deadline | undefined;
        if (ch.op === 'delete') {
          // Ушёл из окна снимка или строку удалили — из открытых убрать; «Закрыто сегодня» не трогаем.
          dropOpen(ch.id);
        } else if (rec?.status === 'done') {
          // Закрыт (с сайта, в таблице или ботом): из открытых — в «Закрыто сегодня». Срок, закрытый раньше
          // (например, ушёл в архив — сервер шлёт его upsert'ом), в «Закрыто сегодня» не попадает.
          dropOpen(ch.id);
          if (!own && rec.closedAt !== TODAY) continue;
          setClosed((cs) => (cs.some((c) => c.deadline.id === ch.id)
            ? cs.map((c) => (c.deadline.id === ch.id ? { ...c, save: 'saved' } : c))
            : [{ deadline: rec, next: null, save: 'saved', requestId: own ? ch.origin : `${ch.origin}-${ch.cursor}`, by: own ? 'сайт' : 'бот' }, ...cs]));
        } else if (rec) {
          // Открытый срок: новый, изменённый или возвращённый после отмены закрытия.
          putOpen(rec);
          setClosed((cs) => cs.filter((c) => c.deadline.id !== ch.id));
        }
      } else if (ch.entity === 'payment') {
        if (ch.op === 'delete') setPayments((xs) => xs.filter((x) => x.id !== ch.id));
        else {
          const rec = { ...(ch.record as Payment) };
          if (own) rec.save = 'saved'; else delete rec.save;
          setPayments((xs) => upsert(xs, rec));
        }
      } else if (ch.entity === 'task') {
        if (ch.op === 'delete') setTasks((xs) => xs.filter((x) => x.id !== ch.id));
        else setTasks((xs) => upsert(xs, ch.record as Task));
      } else if (ch.entity === 'consultation') {
        if (ch.op === 'delete') setConsultations((xs) => xs.filter((x) => x.id !== ch.id));
        else setConsultations((xs) => upsert(xs, ch.record as Consultation));
      } else if (ch.entity === 'inbox') {
        // Решено здесь или в Telegram — приходит upsert со статусом; удалено — delete.
        if (ch.op === 'delete') setInbox((xs) => xs.filter((x) => x.id !== ch.id));
        else {
          const rec = ch.record as InboxItem;
          // Новое сообщение клиента (не наше, раньше не было) — заметное уведомление, а не только цифра в меню.
          if (!own && rec.status === 'new' && hasFeature('inbox')) {
            setInbox((xs) => {
              if (!xs.some((x) => x.id === rec.id)) {
                setNotices((ns) => [...ns, { id: `in-${rec.id}`, text: `Новое сообщение: ${rec.clientName} — «${rec.snippet.slice(0, 60)}${rec.snippet.length > 60 ? '…' : ''}»`, info: true, key: `inbox-new-${rec.id}`, href: `#/inbox/${encodeURIComponent(threadKey(rec))}` }]);
                // Звук «сообщение» играет FailureWatcher (оформление), здесь — только уведомление.
              }
              return upsert(xs, rec);
            });
          } else setInbox((xs) => upsert(xs, rec));
        }
      } else if (ch.entity === 'question') {
        // На сайте — только открытые: отвеченный (здесь или в Telegram) уходит из списка.
        const rec = ch.record as Question | undefined;
        if (ch.op === 'delete' || (rec && rec.answer !== null)) setQuestions((xs) => xs.filter((x) => x.id !== ch.id));
        else if (rec) setQuestions((xs) => upsert(xs, rec));
      } else if (ch.op === 'upsert') {
        setActivity((xs) => (xs.some((a) => a.id === ch.id) ? xs : [ch.record as Activity, ...xs]));
      }
    }
    const last = changes.at(-1);
    if (advance && last && last.cursor > cursorRef.current) { cursorRef.current = last.cursor; setCursor(last.cursor); }
    if (foreign.length) { markFresh(foreign); play('incoming'); }
  }, [markFresh, putOpen, dropOpen]);

  /** Показать запись сразу — с пометкой, что она ещё не в таблице. */
  const applyOptimistic = useCallback((op: WriteOp) => {
    if (op.kind === 'closeDeadlines') {
      const ids = new Set(op.items.map((it) => it.id));
      setDeadlines((xs) => {
        const picked = xs.filter((x) => ids.has(x.id));
        setClosed((cs) => [...picked.map((d) => ({ deadline: d, next: null, save: 'saving' as const, requestId: op.requestId, by: 'сайт' as const, batch: true })),
          ...cs.filter((c) => !(c.requestId === op.requestId && ids.has(c.deadline.id)))]);
        return xs.filter((x) => !ids.has(x.id));
      });
    } else if (op.kind === 'closeDeadline') {
      // Срок — из ref, а не изнутри setDeadlines: вложенный setClosed выполнялся бы позже ответа таблицы и затирал
      // «сохранено» на «сохраняется» (ответ раньше конца строки-«призрака», № 24).
      const d = deadlinesRef.current.find((x) => x.id === op.id);
      if (d) setClosed((cs) => [{ deadline: d, next: null, save: 'saving', requestId: op.requestId, by: 'сайт' }, ...cs.filter((c) => c.requestId !== op.requestId)]);
      setDeadlines((xs) => xs.filter((x) => x.id !== op.id));
    } else if (op.kind === 'addPayment') {
      setPayments((xs) => upsert(xs, { ...op.payment, save: 'saving' }));
    } else if (op.kind === 'cancelPayment') {
      setPayments((xs) => xs.filter((x) => x.id !== op.id));
    } else if (op.kind === 'addClient') {
      setClients((xs) => upsert(xs, op.client));
    } else if (op.kind === 'updateClient') {
      // КВЕД приходит кодами: названия — те, что уже были у клиента (новые — пусто, подставит справочник).
      // income на экран не выносим: строка клиента показывает «сохраняется…» из очереди, а доход встанет по ответу таблицы.
      const { kved, income: _income, ...rest } = op.patch;
      void _income;
      setClients((xs) => xs.map((c) => (c.id === op.id
        ? { ...c, ...rest, ...(kved ? { kved: kved.map((code) => ({ code, title: c.kved.find((k) => k.code === code)?.title ?? '' })) } : {}) }
        : c)));
    } else if (op.kind === 'updateDeadline') {
      const { note: _note, ...patch } = op.patch;
      void _note;
      setDeadlines((xs) => xs.map((d) => (d.id === op.id ? { ...d, ...patch } : d)));
    } else if (op.kind === 'createTask') {
      setTasks((xs) => upsert(xs, op.task));
    } else if (op.kind === 'createConsultation') {
      setConsultations((xs) => upsert(xs, op.consultation));
    } else if (op.kind === 'updateTask') {
      setTasks((xs) => xs.map((t) => (t.id === op.id ? { ...t, ...op.patch } : t)));
    } else if (op.kind === 'deleteTask') {
      setTasks((xs) => xs.filter((t) => t.id !== op.id));
    } else if (op.kind === 'completeTask') {
      setTasks((xs) => xs.map((t) => (t.id === op.id ? { ...t, done: op.done } : t)));
    } else if (op.kind === 'updateDeadlines') {
      const ids = op.items.map((i) => i.id);
      const { note: _n, ...patch } = op.patch;
      void _n;
      setDeadlines((xs) => xs.map((d) => (ids.includes(d.id) ? { ...d, ...patch } : d)));
    } else if (op.kind === 'completeTasks') {
      setTasks((xs) => xs.map((t) => (op.ids.includes(t.id) ? { ...t, done: op.done } : t)));
    } else if (op.kind === 'decideInbox') {
      // «Задача по налогу» статус сообщения не меняет (v5.72) — само сообщение ещё ждёт решения.
      if (op.action !== 'taxTask') {
        const status = op.action === 'accept' ? 'accepted' : op.action === 'task' ? 'task' : 'rejected';
        setInbox((xs) => xs.map((x) => (x.id === op.id ? { ...x, status } : x)));
      }
    } else if (op.kind === 'hideInbox') {
      setInbox((xs) => {
        hiddenBefore.current.set(op.requestId, xs.filter((x) => op.ids.includes(x.id)));
        return xs.filter((x) => !op.ids.includes(x.id));
      });
    } else if (op.kind === 'unhideInbox') {
      // Вернуть то, что было на экране до «Очистить прочитанное» (ответ сервера заменит свежими строками).
      const back = hiddenBefore.current.get(op.requestId) ?? [];
      setInbox((xs) => back.reduce((acc, it) => upsert(acc, it), xs));
    } else if (op.kind === 'answerQuestion') {
      setQuestions((xs) => {
        const q = xs.find((x) => x.id === op.id);
        if (q) answering.current.set(op.requestId, q);
        return xs.filter((x) => x.id !== op.id);
      });
    }
  }, []);

  // Отклик очереди: подтверждение, отказ, конфликт, нет связи.
  useEffect(() => {
    handlerRef.current = (e: OutboxEvent) => {
      const ob = outboxRef.current;
      if (e.type === 'changed') {
        if (ob) { setPending(ob.list()); setCounters({ ...ob.counters }); }
        return;
      }
      if (e.type === 'offline') { setOnlineState(false); return; }
      const op = e.item.op;
      // Ответ (любой) пришёл раньше конца анимации — сначала показать запись, потом разбирать ответ.
      delayed.current.get(op.requestId)?.();
      if (e.type === 'applied') {
        setOnlineState(true);
        applyChanges(e.result.changes, false);
        // Следствия записи (журнал, пересчёты) — сразу, не ждать 30 с; несколько записей подряд — один опрос.
        if (syncSoon.current) window.clearTimeout(syncSoon.current);
        syncSoon.current = window.setTimeout(() => { syncSoon.current = null; void syncRef.current(); }, 800);
        callbacks.current.get(op.requestId)?.(e.result.changes, e.result);
        callbacks.current.delete(op.requestId);
        return;
      }
      if (e.type === 'conflict' && op.kind === 'updateClient' && !('income' in op.patch) && e.result.current && 'phone' in e.result.current) {
        setConflict({ requestId: op.requestId, clientId: op.id, mine: op.patch.phone ?? '', theirs: e.result.current.phone });
        play('attention');
        return;
      }
      // Отказ: показать честно. SERVER — запись остаётся «не сохранилось — повторить»;
      // PERIOD_OPEN / NOT_FOUND — повтор не поможет: экран возвращается к правде таблицы.
      const final = e.result.code !== 'SERVER';
      if (op.kind === 'closeDeadlines' && final) {
        // Пакет целиком не принят (VALIDATION, BUSY, MAINTENANCE) — все сроки возвращаются в список.
        setClosed((cs) => {
          for (const c of cs) if (c.requestId === op.requestId) putOpen(c.deadline);
          return cs.filter((c) => c.requestId !== op.requestId);
        });
      }
      if (op.kind === 'closeDeadline') {
        setClosed((cs) => {
          const entry = cs.find((c) => c.requestId === op.requestId);
          if (entry && final) putOpen(entry.deadline);
          return final ? cs.filter((c) => c.requestId !== op.requestId) : cs.map((c) => (c.requestId === op.requestId ? { ...c, save: 'failed' } : c));
        });
      }
      // Решение по сообщению не приняли — сообщение возвращается таким, какое оно на сервере (или снова «новое»).
      if (op.kind === 'decideInbox' && final) {
        const cur = e.result.current && 'snippet' in e.result.current ? e.result.current : null;
        setInbox((xs) => xs.map((x) => (x.id === op.id ? (cur ?? { ...x, status: 'new' }) : x)));
      }
      // Карточку не поправили (VALIDATION телефона/почты, NOT_FOUND…) — строка клиента такая, какая в таблице или была.
      if (op.kind === 'updateClient' && final && (e.type !== 'conflict' || 'income' in op.patch)) {
        const cur = e.result.current && 'kind' in e.result.current ? e.result.current : clientsBefore.current.get(op.requestId);
        if (cur) setClients((xs) => xs.map((c) => (c.id === cur.id ? cur : c)));
        clientsBefore.current.delete(op.requestId);
      }
      // Задачу не поправили / не удалили — она возвращается такой, какая она в таблице (или какой была).
      if ((op.kind === 'updateTask' || op.kind === 'deleteTask') && final) {
        const cur = e.result.current && 'priority' in e.result.current ? e.result.current : tasksBefore.current.get(op.requestId);
        if (cur && e.result.code !== 'NOT_FOUND') setTasks((xs) => upsert(xs, cur));
        tasksBefore.current.delete(op.requestId);
      }
      // Правку срока таблица не приняла — срок возвращается таким, какой он в таблице.
      if (op.kind === 'updateDeadline' && e.result.current && 'periodicity' in e.result.current) putOpen(e.result.current);
      // Отмену платежа сервер не выполнил — платёж возвращается на экран таким, каким он стал в таблице.
      if ((op.kind === 'cancelPayment' || op.kind === 'updatePayment') && e.result.current && 'kopecks' in e.result.current) {
        const cur = e.result.current;
        setPayments((xs) => upsert(xs, cur));
      }
      if (op.kind === 'addPayment') setPayments((xs) => xs.map((p) => (p.id === op.payment.id ? { ...p, save: 'failed' } : p)));
      // Задачу таблица не приняла окончательно (VALIDATION: «Выберите клиента», клиента нет) — убрать её с экрана, иначе
      // она стоит в списке как записанная при «Всё сохранено» (вечерняя проверка 15.10, тестовый клиент удалён).
      if (op.kind === 'createTask' && final) setTasks((xs) => xs.filter((t) => t.id !== op.task.id));
      // Не скрылось — сообщения возвращаются на экран; не вернулось — остаются скрытыми (их уже нет на экране).
      if (op.kind === 'hideInbox' && final) {
        const back = hiddenBefore.current.get(op.requestId) ?? [];
        setInbox((xs) => back.reduce((acc, it) => upsert(acc, it), xs));
        hiddenBefore.current.delete(op.requestId);
      }
      if (op.kind === 'unhideInbox' && final) setInbox((xs) => xs.filter((x) => !op.ids.includes(x.id)));
      if (op.kind === 'createConsultation' && final) setConsultations((xs) => xs.filter((k) => k.id !== op.consultation.id));
      // «Сделано» не принято — галочка возвращается.
      if (op.kind === 'completeTask' && final) setTasks((xs) => xs.map((t) => (t.id === op.id ? { ...t, done: !op.done } : t)));
      if (op.kind === 'completeTasks' && final) setTasks((xs) => xs.map((t) => (op.ids.includes(t.id) ? { ...t, done: !op.done } : t)));
      // Ответ не записался: вопрос возвращается, если он всё ещё открыт (уже отвечен в Telegram — не возвращаем).
      if (op.kind === 'answerQuestion' && final) {
        const q = answering.current.get(op.requestId);
        const answered = e.result.current && 'options' in e.result.current && e.result.current.answer !== null;
        if (q && !answered) setQuestions((xs) => upsert(xs, q));
        answering.current.delete(op.requestId);
      }
      // Уже решено в Telegram или в другой вкладке (CONFLICT с current) — это не ошибка: сообщаем спокойно, чем решено.
      const decided = op.kind === 'decideInbox' && e.result.code === 'CONFLICT' && e.result.current && 'snippet' in e.result.current ? e.result.current : null;
      if (final && decided) {
        void outboxRef.current?.discard(op.requestId);
        const how = decided.status === 'accepted' ? 'записано' : decided.status === 'task' ? 'задача создана' : decided.status === 'rejected' ? 'отклонено' : 'ещё ждёт решения';
        setNotices((ns) => [...ns, { id: op.requestId, text: `Уже решено: ${how} — ${decided.clientName}`, info: true, key: `inbox-${decided.id}` }]);
        return;
      }
      if (final) {
        void outboxRef.current?.discard(op.requestId);
        // Повтор не поможет — сказать, что случилось (иначе экран молча вернулся бы к таблице).
        setNotices((ns) => [...ns, { id: op.requestId, text: `${e.item.label}: ${e.result.message}` }]);
      }
      play('attention');
    };
  }, [applyChanges, putOpen]);

  // Загрузка: снимок таблицы, затем очередь, оставшаяся с прошлого раза (показываем её поверх снимка).
  // ready = false — снимок из прошлой загрузки этой вкладки: показываем, но изменения от его курсора не тянем.
  const applySnapshot = useCallback((snap: Snapshot, ready = true) => {
    setClients(snap.clients); setPayments(snap.payments); setActivity(snap.activity); setTasks(snap.tasks); setQuestions(snap.questions); setInbox(snap.inbox);
    // Сервер не собрал консультации (consultationsSkipped) — свой список не затираем.
    if (!snap.consultationsSkipped) setConsultations(snap.consultations ?? []);
    const open = snap.deadlines.filter((d) => d.status !== 'done');
    setDeadlines(open.filter(isDated));
    setUndated(open.filter((d) => !isDated(d)));
    setClosed(snap.deadlines.filter((d) => d.status === 'done' && d.closedAt === TODAY)
      .map((d) => ({ deadline: d, next: null, save: 'saved', requestId: `snap-${d.id}`, by: 'бот' })));
    cursorRef.current = snap.cursor; setCursor(snap.cursor);
    snapReady.current = ready;
  }, []);

  useEffect(() => {
    let alive = true;
    const ob = new Outbox(api, {
      set: (k, v) => kvSet('outbox', k, v),
      del: (k) => kvDelete('outbox', k),
      all: () => kvAll<OutboxItem>('outbox'),
    }, (e) => handlerRef.current(e));
    outboxRef.current = ob;
    void (async () => {
      // Обновили вкладку — прошлый снимок этой вкладки сразу, свежий следом (п. 20: первый экран ждал 7–9 с).
      const cached = isLive() ? readSnap() : null;
      if (cached) { applySnapshot(cached, false); setStale(true); setLoaded(true); setSyncedAt(readSnapAt()); }
      try {
        const snap = await api.snapshot();
        if (!alive) return;
        applySnapshot(snap);
        if (isLive()) saveSnap(snap);
        setSyncedAt(Date.now());
        setStale(false);
        setLoadError(null);
      } catch (e) {
        setOnlineState(false);
        // Живой режим без снимка — пустые экраны вводили бы в заблуждение: показать, что случилось.
        // Прошлый снимок вкладки на экране — оставляем его и честно пишем «не обновилось».
        if (alive && isLive() && !cached) setLoadError(e instanceof ApiError ? e.message : 'Таблица не ответила');
      }
      const left = await ob.load();
      for (const it of left) { mine.current.add(it.op.requestId); applyOptimistic(it.op); }
      if (alive) setLoaded(true);
    })();
    return () => { alive = false; };
  }, [applyOptimistic, applySnapshot, attempt]);

  const reload = useCallback(() => { setLoadError(null); setLoaded(false); setAttempt((n) => n + 1); }, []);

  const syncNow = useCallback(async () => {
    if (!snapReady.current) return;
    if (syncing.current) { syncAgain.current = true; return; }
    syncing.current = true;
    try {
      const res = await api.changesSince(cursorRef.current);
      setOnlineState(true);
      setSyncedAt(Date.now());
      applyChanges(res.changes);
      cursorRef.current = Math.max(cursorRef.current, res.cursor);
      setCursor(cursorRef.current);
      void outboxRef.current?.kick(true);
    } catch (e) {
      // Журнал таблицы хранит 30 дней: курсор старше — берём снимок заново, неотправленное снова поверх.
      if (e instanceof ApiError && e.code === 'CURSOR_EXPIRED') {
        try {
          applySnapshot(await api.snapshot());
          for (const it of outboxRef.current?.list() ?? []) applyOptimistic(it.op);
          return;
        } catch { /* ниже — «нет связи» */ }
      }
      // Вход не удался — экран входа покажет App; ночное обслуживание — данные на экране верны, ждём. Это не обрыв связи.
      if (e instanceof ApiError && (e.code === 'AUTH_REQUIRED' || e.code === 'FORBIDDEN' || e.code === 'MAINTENANCE')) return;
      setOnlineState(false);
    } finally {
      syncing.current = false;
      // Пока шёл опрос, пришёл повод для ещё одного (возврат во вкладку, запись) — один повтор, не очередь.
      if (syncAgain.current) { syncAgain.current = false; void syncRef.current(); }
    }
  }, [applyChanges, applySnapshot, applyOptimistic]);
  useEffect(() => { syncRef.current = syncNow; }, [syncNow]);

  // Обратная связь из таблицы: каждые 30 с на открытой вкладке и сразу при возврате во вкладку / появлении сети.
  useEffect(() => {
    const tick = () => { if (!document.hidden) void syncNow(); };
    const t = window.setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('online', tick);
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', tick); window.removeEventListener('online', tick); };
  }, [syncNow]);

  const send = useCallback((op: WriteOp, label: string, onApplied?: (changes: Change[], result: Applied) => void, showAfterMs = 0, holdMs = 0) => {
    // Раздел ещё только для просмотра (config.json → writes): в таблицу не пишем, говорим, где сделать.
    const area = AREA_OF[op.kind];
    if (area && !canWrite(area)) {
      setNotices((ns) => [...ns, { id: op.requestId, text: roMessage(area), info: true, key: `ro-${area}` }]);
      return;
    }
    mine.current.add(op.requestId);
    if (onApplied) callbacks.current.set(op.requestId, onApplied);
    // Запись — в очередь сразу; на экране — сразу или после короткой анимации (таймер, не кадры анимации:
    // в фоновой вкладке кадры почти не идут, а запись ждать не должна).
    if (showAfterMs > 0) {
      // Ответ таблицы может прийти раньше конца анимации (строка-«призрак» 3 с, № 24) — тогда показ сразу, в 'applied':
      // иначе «Вернуть срок» из уведомления не нашёл бы срок в «закрыто», а строка зависла бы на «сохраняется».
      const t = window.setTimeout(() => { delayed.current.delete(op.requestId); applyOptimistic(op); }, showAfterMs);
      delayed.current.set(op.requestId, () => { window.clearTimeout(t); delayed.current.delete(op.requestId); applyOptimistic(op); });
    }
    else applyOptimistic(op);
    void outboxRef.current?.enqueue(op, label, holdMs);
  }, [applyOptimistic]);

  const client = useCallback((id: string) => clients.find((c) => c.id === id), [clients]);

  const closeDeadline = useCallback((id: string, onSaved?: (next: Deadline | null, notifyAt: string | null) => void, hideAfterMs = 0): CloseResult => {
    const d = deadlines.find((x) => x.id === id);
    if (!d) return { ok: false, reason: 'Срок не найден — обновите страницу' };
    // Проверка периода — и здесь, и на сервере (бриф, п. 3: баг с декларациями III кв., закрытыми в июле).
    // periodEnd — последний день периода (контракт v2, п. 22): закрыть можно со следующего дня.
    if (d.periodEnd && TODAY <= d.periodEnd) {
      return { ok: false, reason: `Период ещё не закончился — закрыть можно с ${fmtDate(addDays(d.periodEnd, 1))}` };
    }
    const requestId = newRequestId();
    send({ kind: 'closeDeadline', requestId, id, baseVersion: d.version }, `Закрыть «${d.what}»`, (changes, result) => {
      const next = (changes.find((c) => c.entity === 'deadline' && c.op === 'upsert' && (c.record as Deadline).status !== 'done')?.record as Deadline | undefined) ?? null;
      setClosed((cs) => cs.map((c) => (c.requestId === requestId ? { ...c, save: 'saved', next } : c)));
      if (next) markFresh([next.id]);
      onSaved?.(next, result.notifyAt ?? null);
    }, hideAfterMs);
    return { ok: true };
  }, [deadlines, send, markFresh]);

  /** Закрыть несколько сроков (п. 5): по 20 в пакете (deadlines.closeMany). Период не закончился — не отправляем,
   *  возвращаем причину. Итог по каждому пакету — в onDone: сколько закрыто и что не закрылось. */
  const closeDeadlines = useCallback((ids: string[], onDone?: (closed: number, failed: { what: string; message: string }[]) => void) => {
    const picked = deadlines.filter((d) => ids.includes(d.id));
    const skipped = picked.filter((d) => d.periodEnd && TODAY <= d.periodEnd)
      .map((d) => ({ id: d.id, what: d.what, message: `период ещё не закончился — с ${fmtDate(addDays(d.periodEnd ?? TODAY, 1))}` }));
    const ok = picked.filter((d) => !skipped.some((s) => s.id === d.id));
    for (let i = 0; i < ok.length; i += 20) {
      const part = ok.slice(i, i + 20);
      const requestId = newRequestId();
      send({ kind: 'closeDeadlines', requestId, items: part.map((d) => ({ id: d.id, baseVersion: d.version })) },
        `Закрыть ${part.length} ${plural(part.length, 'срок', 'срока', 'сроков')}`, (changes, result) => {
          const done = changes.filter((c) => c.entity === 'deadline' && c.op === 'upsert' && (c.record as Deadline).status === 'done').map((c) => c.record as Deadline);
          const nexts = changes.filter((c) => c.entity === 'deadline' && c.op === 'upsert' && (c.record as Deadline).status !== 'done').map((c) => c.record as Deadline);
          const failed = result.failed ?? [];
          setClosed((cs) => cs.flatMap((c) => {
            if (c.requestId !== requestId) return [c];
            const f = failed.find((x) => x.id === c.deadline.id);
            if (f) { putOpen(f.current && isDated(f.current) ? f.current : c.deadline); return []; }
            // Пара из ответа сервера; без неё (старый сервер) — тот же клиент, ещё не занятый другим закрытым.
            const nid = result.nextOf?.[c.deadline.id];
            const next = (nid !== undefined ? nexts.find((n) => n.id === nid) : nexts.find((n) => n.clientId === c.deadline.clientId)) ?? null;
            return [{ ...c, save: 'saved' as const, next }];
          }));
          if (nexts.length) markFresh(nexts.map((n) => n.id));
          onDone?.(done.length, failed.map((f) => ({ what: part.find((d) => d.id === f.id)?.what ?? f.id, message: f.message })));
        });
    }
    return { sent: ok.length, skipped };
  }, [deadlines, send, markFresh, putOpen]);

  const reopenDeadline = useCallback((id: string) => {
    const entry = closedRef.current.find((c) => c.deadline.id === id);
    if (!entry) return;
    setClosed((cs) => cs.filter((c) => c !== entry));
    setDeadlines((xs) => xs.filter((x) => x.id !== entry.next?.id));
    putOpen(entry.deadline);
    // Отмена — тоже запись в таблицу; если закрытие ещё в очереди — просто убираем его оттуда.
    // Из пакета так нельзя (уйдут и остальные): отмена встаёт в очередь следом за пакетом.
    if (!entry.batch && outboxRef.current?.has(entry.requestId)) { void outboxRef.current.discard(entry.requestId); return; }
    send({ kind: 'reopenDeadline', requestId: newRequestId(), id, undoOf: entry.requestId }, `Отменить закрытие «${entry.deadline.what}»`);
  }, [send, putOpen]);

  const addPayment = useCallback((p: Omit<Payment, 'id' | 'version' | 'source' | 'save'>, onSaved?: () => void) => {
    const requestId = newRequestId();
    // id платежа создаёт браузер (= requestId): повтор из очереди не создаст второй платёж.
    send({ kind: 'addPayment', requestId, payment: { ...p, id: requestId, version: 0, source: 'сайт' } }, 'Платёж', () => onSaved?.());
    return requestId;
  }, [send]);

  const removePayment = useCallback((id: string) => {
    if (outboxRef.current?.has(id)) { void outboxRef.current.discard(id); setPayments((xs) => xs.filter((x) => x.id !== id)); return; }
    const p = paymentsRef.current.find((x) => x.id === id);
    if (!p) return;
    send({ kind: 'cancelPayment', requestId: newRequestId(), id, baseVersion: p.version }, 'Отменить платёж');
  }, [send]);

  /** Правка пустой ячейки платежа: на экране строка остаётся с «сохраняется…» (в очереди), встаёт на место после ответа таблицы. */
  const updatePayment = useCallback((id: string, patch: PaymentPatch, label: string) => {
    const p = paymentsRef.current.find((x) => x.id === id);
    if (!p) return;
    send({ kind: 'updatePayment', requestId: newRequestId(), id, baseVersion: p.version, patch }, label);
  }, [send]);

  const addClient = useCallback((data: Omit<Client, 'id' | 'version'>, onSaved?: (created: Deadline[], client: Client) => void) => {
    const requestId = newRequestId();
    // Временный id только для экрана; настоящий выдаёт сервер (контракт v2, п. 8) — подменяем по ответу.
    const temp: Client = { ...data, id: `tmp-${requestId.slice(0, 8)}`, version: 0 };
    send({ kind: 'addClient', requestId, client: temp }, `Новый клиент ${temp.name}`, (changes) => {
      const real = changes.find((ch) => ch.entity === 'client')?.record as Client | undefined;
      setClients((xs) => xs.filter((x) => x.id !== temp.id));
      onSaved?.(changes.filter((ch) => ch.entity === 'deadline').map((ch) => ch.record as Deadline), real ?? temp);
    });
    return temp;
  }, [send]);

  // Строка клиента до правки — вернуть её, если сервер откажет (v2.2: VALIDATION phone/email).
  const clientsBefore = useRef(new Map<string, Client>());
  const updateContact = useCallback((clientId: string, patch: { phone?: string; email?: string }, baseVersion: number, label: string) => {
    const before = clients.find((c) => c.id === clientId);
    const requestId = newRequestId();
    if (before) clientsBefore.current.set(requestId, before);
    send({ kind: 'updateClient', requestId, id: clientId, baseVersion, patch }, label, () => clientsBefore.current.delete(requestId));
  }, [clients, send]);
  const updateKved = useCallback((clientId: string, codes: string[], baseVersion: number) => {
    const before = clients.find((c) => c.id === clientId);
    const requestId = newRequestId();
    if (before) clientsBefore.current.set(requestId, before);
    send({ kind: 'updateClient', requestId, id: clientId, baseVersion, patch: { kved: codes } }, 'КВЕД клиента', () => clientsBefore.current.delete(requestId));
  }, [clients, send]);
  const updateIncome = useCallback((clientId: string, income: { amountKopecks: number; basis: IncomeBasis }, baseVersion: number) => {
    send({ kind: 'updateClient', requestId: newRequestId(), id: clientId, baseVersion, patch: { income } }, 'Доход клиента');
  }, [send]);
  const updatePhone = useCallback((clientId: string, phone: string, baseVersion: number) => {
    updateContact(clientId, { phone }, baseVersion, 'Телефон клиента');
  }, [updateContact]);

  const updateEmail = useCallback((clientId: string, email: string, baseVersion: number) => {
    updateContact(clientId, { email }, baseVersion, 'Почта клиента');
  }, [updateContact]);

  const addTask = useCallback((t: Omit<Task, 'id' | 'version' | 'done'>) => {
    const requestId = newRequestId();
    send({ kind: 'createTask', requestId, task: { ...t, id: requestId, version: 1, done: false } }, `Задача «${t.text}»`);
  }, [send]);

  const addConsultation = useCallback((k: { clientId: string; topic: string; minutes: number | null; note: string }) => {
    const requestId = newRequestId();
    // Временный id = requestId. Сервер v5.87 даёт консультации тот же id — ответ просто заменяет строку; если бы дал свой,
    // временную убираем (иначе на экране две одинаковые).
    send({ kind: 'createConsultation', requestId, consultation: { ...k, id: requestId, version: 0, at: null } }, `Консультация: ${k.topic}`,
      (changes) => {
        if (!changes.some((ch) => ch.entity === 'consultation' && ch.id === requestId)) setConsultations((xs) => xs.filter((x) => x.id !== requestId));
      });
  }, [send]);

  /** tasks.update / tasks.delete (п. 14). До ответа — задача уже изменена/убрана на экране; отказ возвращает её. */
  const tasksBefore = useRef(new Map<string, Task>());
  const updateTask = useCallback((id: string, patch: TaskPatch) => {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    const requestId = newRequestId();
    tasksBefore.current.set(requestId, t);
    send({ kind: 'updateTask', requestId, id, baseVersion: t.version, patch }, `Задача: ${t.text.slice(0, 40)}`, () => tasksBefore.current.delete(requestId));
  }, [tasks, send]);
  const deleteTask = useCallback((id: string) => {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    const requestId = newRequestId();
    tasksBefore.current.set(requestId, t);
    send({ kind: 'deleteTask', requestId, id, baseVersion: t.version }, `Удалить задачу: ${t.text.slice(0, 40)}`, () => tasksBefore.current.delete(requestId));
  }, [tasks, send]);

  const toggleTask = useCallback((id: string, done: boolean) => {
    send({ kind: 'completeTask', requestId: newRequestId(), id, done }, done ? 'Задача сделана' : 'Задача снова в работе');
  }, [send]);

  /** «Сделано» пачкой: tasks.completeMany по 20 (флаг completeMany), иначе — по одной. Не отметившиеся — назад. */
  const completeTasks = useCallback((ids: string[], done: boolean) => {
    if (!hasFeature('completeMany')) { for (const id of ids) toggleTask(id, done); return; }
    for (let i = 0; i < ids.length; i += 20) {
      const part = ids.slice(i, i + 20);
      send({ kind: 'completeTasks', requestId: newRequestId(), ids: part, done }, done ? `Сделано: ${part.length}` : `Снова в работе: ${part.length}`, (_ch, result) => {
        const bad = (result.failed ?? []).map((f) => f.id);
        if (!bad.length) return;
        setTasks((xs) => xs.map((t) => (bad.includes(t.id) ? { ...t, done: !done } : t)));
        setNotices((ns) => [...ns, { id: `ct-${Date.now()}`, text: `Не отметились: ${bad.length} — ${(result.failed ?? [])[0]?.message ?? ''}`, info: true }]);
      });
    }
  }, [send, toggleTask]);

  /** «Запись изменилась в таблице»: оставить своё (отправить поверх новой версии) или взять из таблицы. */
  const resolveConflict = useCallback((keep: 'mine' | 'theirs') => {
    const cf = conflict;
    if (!cf) return;
    setConflict(null);
    void outboxRef.current?.discard(cf.requestId);
    void syncNow().then(() => {
      if (keep !== 'mine') return;
      void api.snapshot().then((snap) => {
        const c = snap.clients.find((x) => x.id === cf.clientId);
        if (c) send({ kind: 'updateClient', requestId: newRequestId(), id: c.id, baseVersion: c.version, patch: { phone: cf.mine } }, 'Телефон клиента');
      });
    });
  }, [conflict, send, syncNow]);

  const retry = useCallback((rid: string) => { void outboxRef.current?.retry(rid); }, []);
  const discard = useCallback((rid: string) => { void outboxRef.current?.discard(rid); }, []);

  const external = useCallback((kind: ExternalKind) => {
    const text = fakeServer.external(kind);
    void syncNow();
    return text;
  }, [syncNow]);

  const setOnline = useCallback((on: boolean) => {
    fakeServer.online = on;
    setOnlineState(on);
    if (on) void syncNow();
  }, [syncNow]);

  const revealPassword = useCallback(async (clientId: string) => (liveApi
    ? liveApi.revealPassword(clientId)
    : { login: 'демо-логин', password: 'демо-пароль-не-настоящий', ttlSeconds: 30 }), []);

  const updateDeadline = useCallback((id: string, patch: DeadlinePatch, label: string) => {
    const d = deadlines.find((x) => x.id === id) ?? undated.find((x) => x.id === id);
    if (!d) return;
    send({ kind: 'updateDeadline', requestId: newRequestId(), id, baseVersion: d.version, patch }, label);
  }, [deadlines, undated, send]);

  /** «В работе» / «Ожидание» / дата для нескольких сроков: deadlines.updateMany по 20 (флаг updateMany), иначе по одному.
   *  Не изменившиеся — такими, какие они в таблице (current), и названы в уведомлении. */
  const updateDeadlines = useCallback((ids: string[], patch: DeadlinePatch, label: string) => {
    const picked = deadlines.filter((d) => ids.includes(d.id));
    if (!hasFeature('updateMany')) { for (const d of picked) updateDeadline(d.id, patch, label); return; }
    for (let i = 0; i < picked.length; i += 20) {
      const part = picked.slice(i, i + 20);
      send({ kind: 'updateDeadlines', requestId: newRequestId(), items: part.map((d) => ({ id: d.id, baseVersion: d.version })), patch }, `${label}: ${part.length}`, (_ch, result) => {
        const failed = result.failed ?? [];
        if (!failed.length) return;
        for (const f of failed) { const cur = f.current ?? part.find((d) => d.id === f.id); if (cur) putOpen(cur); }
        setNotices((ns) => [...ns, { id: `um-${Date.now()}`, text: `Не изменились: ${failed.length} — ${failed[0]?.message ?? ''}`, info: true }]);
      });
    }
  }, [deadlines, send, updateDeadline, putOpen]);

  const renewKey = useCallback((clientId: string, keyUntil: string, keyFrom: string | null, keyIssuer: string | null) => {
    const c = clients.find((x) => x.id === clientId);
    if (!c) return;
    const patch: { keyUntil: string; keyFrom?: string; keyIssuer?: string } = { keyUntil };
    if (keyFrom) patch.keyFrom = keyFrom;
    if (keyIssuer) patch.keyIssuer = keyIssuer;
    send({ kind: 'updateClient', requestId: newRequestId(), id: clientId, baseVersion: c.version, patch }, `Ключ ЭЦП: ${c.name}`);
  }, [clients, send]);

  // Один requestId на одно нажатие «Отправить»: повтор того же запроса сервер второй раз не отправит.
  const remindClient = useCallback(async (req: RemindRequest) => {
    const r = await api.remindClient(req, newRequestId());
    if (r.sent) void syncNow(); // в ленте «Что изменилось» появится запись сервера
    return r;
  }, [syncNow]);

  const cancelNotify = useCallback((deadlineId: string) => api.cancelNotify(deadlineId, newRequestId()), []);
  const createDeadlineNow = useCallback(async (d: NewDeadline, requestId: string) => {
    const r = await api.createDeadline(d, requestId);
    if (r.ok) { putOpen(r.deadline); markFresh([r.deadline.id]); void syncNow(); }
    return r;
  }, [putOpen, markFresh, syncNow]);
  const createDeadline = hasFeature('deadlinesCreate') && canWrite('deadlines') ? createDeadlineNow : null;
  const botLinkNow = useCallback((clientId: string) => api.clientBotLink(clientId), []);
  const botLink = hasFeature('botLink') ? botLinkNow : null;
  const archive = useMemo(() => (hasFeature('archive') ? (id: string, offset?: number, limit?: number) => api.listArchive(id, offset, limit) : null), []);
  const attention = useMemo(() => (hasFeature('attention') ? (limit?: number) => api.attention(limit) : null), []);
  const month = useMemo(() => (hasFeature('month')
    // Галочка пишет в лист «🗓 Месяц» — отдельным флагом monthWrite: просмотр (month) включается без проверки записи.
    ? { get: () => api.monthGet(), set: hasFeature('monthWrite') && canWrite('tasks') ? (id: string, item: MonthCheck, done: boolean) => api.monthSet(id, item, done) : null } : null), []);
  const sendStatementNow = useCallback(async (clientId: string) => {
    const r = await api.sendStatement(clientId, newRequestId());
    if (r.sent) void syncNow();
    return r;
  }, [syncNow]);
  const statement = useMemo(() => {
    const canSend = hasFeature('sendStatement') && canWrite('remind');
    return {
      pdf: hasFeature('statementPdf') ? (id: string) => api.statementPdf(id) : null,
      preview: canSend ? (id: string) => api.statementPreview(id) : null,
      send: canSend ? sendStatementNow : null,
    };
  }, [sendStatementNow]);
  const applyTemplateNow = useCallback(async (clientId: string, template: DeadlineTemplate | undefined, requestId: string) => {
    const r = await api.applyTemplate(clientId, template, requestId);
    if (r.ok && r.added.length) { for (const d of r.added) putOpen(d); markFresh(r.added.map((d) => d.id)); void syncNow(); }
    return r;
  }, [putOpen, markFresh, syncNow]);
  const templates = useMemo(() => (hasFeature('applyTemplate') && canWrite('deadlines')
    ? { preview: (clientId: string, template?: DeadlineTemplate) => api.previewTemplate(clientId, template), apply: applyTemplateNow } : null), [applyTemplateNow]);
  const cancelCloseNotice = hasFeature('cancelNotify') && canWrite('deadlines') ? cancelNotify : null;

  const remindPreview = useCallback(async (req: Omit<RemindRequest, 'text'>) => {
    if (!hasFeature('remindPreview')) return null;
    try { return await api.remindPreview(req); } catch { return null; }
  }, []);

  const loadClientCard = useCallback(async (id: string) => {
    const card = await api.clientCard(id);
    const add = <T extends { id: string }>(xs: T[], more: T[]) => [...xs, ...more.filter((m) => !xs.some((x) => x.id === m.id))];
    // Строка клиента из clients.get свежее снимка (почта, «ключ с», бот) — заменяем, если версия не старее.
    setClients((xs) => xs.map((x) => (x.id === id && (card.client.version ?? 0) >= (x.version ?? 0) ? card.client : x)));
    setPayments((xs) => add(xs, card.payments));
    setTasks((xs) => add(xs, card.tasks));
    setConsultations((xs) => add(xs, card.consultations ?? []));
    return card.history;
  }, []);

  const loadPaymentsMonth = useCallback(async (month: string) => {
    const res = await api.listPayments(month);
    setPayments((xs) => res.payments.reduce((acc, p) => (acc.some((x) => x.id === p.id) ? acc : [...acc, p]), xs));
    return res.totalKopecks;
  }, []);

  const questionsAt = useRef(0);
  const refreshQuestions = useCallback(async () => {
    // Не чаще раза в 2 мин и только после снимка: запрос к таблице стоит 3–4 с.
    if (!snapReady.current || Date.now() - questionsAt.current < 120_000) return;
    questionsAt.current = Date.now();
    try { setQuestions(await api.listQuestions()); } catch { /* вопросы останутся из снимка */ }
  }, []);

  const decideInbox = useCallback((id: string, action: InboxAction, amount?: number) => {
    const it = inbox.find((x) => x.id === id);
    const label = action === 'accept' ? `Принять: ${it?.clientName ?? 'сообщение'}` : action === 'task' ? `Задача из сообщения: ${it?.clientName ?? ''}`
      : action === 'taxTask' ? `Задача по налогу: ${it?.clientName ?? ''}` : `Отклонить: ${it?.clientName ?? 'сообщение'}`;
    const requestId = newRequestId();
    // «Нет» сервер вернуть не умеет — 10 с на «Отменить» до отправки (находка «Пользователя» № 15).
    send({ kind: 'decideInbox', requestId, id, action, ...(amount !== undefined ? { amount } : {}) }, label, undefined, 0, action === 'reject' ? HOLD_MS : 0);
    return requestId;
  }, [inbox, send]);

  const answerQuestion = useCallback((id: string, text: string, onSaved?: () => void, replace = false) => {
    const requestId = newRequestId();
    // Первый ответ в таблице без флага answerReplace сайт изменить не может — 10 с на «Отменить» до отправки (находка № 2).
    // Замена (replace) — осознанное «Изменить»: без ожидания.
    if (replace) send({ kind: 'answerQuestion', requestId, id, text, replace: true }, 'Изменение ответа', () => onSaved?.(), 0, 0);
    else send({ kind: 'answerQuestion', requestId, id, text }, 'Ответ на вопрос', () => onSaved?.(), 0, HOLD_MS);
    return requestId;
  }, [send]);

  /** «Удалить» во «Входящих» (только на сайте, Telegram мамы не трогаем): 10 с на «Отменить», потом inbox.hide.
   *  null — нет флага inboxHide. Возвращает requestId для undoHeld. */
  const hideInboxNow = useCallback((ids: string[]) => {
    const requestId = newRequestId();
    send({ kind: 'hideInbox', requestId, ids: ids.slice(0, 20) }, `Убрать с сайта: ${ids.length}`, () => hiddenBefore.current.delete(requestId), 0, HOLD_MS);
    return requestId;
  }, [send]);

  /** «Очистить прочитанное»: все решённые — inbox.hideAll (повторяет, пока more). Возвращает, сколько убрано, и функцию
   *  «Отменить» (inbox.unhide по 20). Мимо очереди: без ответа сервера не знаем, что именно убрано. */
  const clearReadNow = useCallback(async (): Promise<{ hidden: number; undo: () => void }> => {
    const before = inboxRef.current;
    const ids: string[] = [];
    for (let i = 0; i < 20; i++) {
      const r = await api.inboxHideAll();
      ids.push(...r.ids);
      if (!r.more) break;
    }
    const gone = before.filter((x) => ids.includes(x.id));
    setInbox((xs) => xs.filter((x) => !ids.includes(x.id)));
    const undo = () => {
      for (let i = 0; i < ids.length; i += 20) {
        const part = ids.slice(i, i + 20);
        const requestId = newRequestId();
        hiddenBefore.current.set(requestId, gone.filter((x) => part.includes(x.id)));
        send({ kind: 'unhideInbox', requestId, ids: part }, `Вернуть во «Входящие»: ${part.length}`, () => hiddenBefore.current.delete(requestId));
      }
    };
    return { hidden: ids.length, undo };
  }, [send]);
  // Фото клиентов: после снимка и раз в 30 мин, с etag; notModified — ничего не перерисовываем (тот же объект).
  const [photos, setPhotoState] = useState<Readonly<Record<string, string>>>({});
  const photoEtag = useRef<string | null>(null);
  useEffect(() => {
    if (!loaded || !hasFeature('photos')) return;
    let alive = true;
    const load = () => {
      // Фото — украшение: любой сбой (и синхронный) не должен ронять кабинет — аватар останется буквами.
      Promise.resolve().then(() => api.clientPhotos(photoEtag.current)).then((r) => {
        if (!alive || r.notModified) return;
        photoEtag.current = r.etag;
        setPhotoState(setPhotos(r.photos));
      }, () => { /* без фото — буквы, попробуем в следующий раз */ });
    };
    load();
    const t = window.setInterval(load, 30 * 60_000);
    return () => { alive = false; window.clearInterval(t); };
  }, [loaded]);
  const aiAsk = useMemo(() => (hasFeature('aiChat') ? (q: string, clientId: string | null) => api.aiAsk(q, clientId) : null), []);
  const inboxHide = useMemo(() => (hasFeature('inboxHide') ? { hide: hideInboxNow, clearRead: clearReadNow } : null), [hideInboxNow, clearReadNow]);

  const undoHeld = useCallback(async (requestId: string) => {
    const ob = outboxRef.current;
    const op = ob?.list().find((i) => i.op.requestId === requestId)?.op;
    if (!ob || !op || !(await ob.cancelHeld(requestId))) return false;
    mine.current.delete(requestId);
    callbacks.current.delete(requestId);
    if (op.kind === 'decideInbox') setInbox((xs) => xs.map((x) => (x.id === op.id ? { ...x, status: 'new' } : x)));
    if (op.kind === 'hideInbox') {
      const back = hiddenBefore.current.get(requestId) ?? [];
      setInbox((xs) => back.reduce((acc, it) => upsert(acc, it), xs));
      hiddenBefore.current.delete(requestId);
    }
    if (op.kind === 'answerQuestion') {
      const q = answering.current.get(requestId);
      if (q) setQuestions((xs) => upsert(xs, q));
      answering.current.delete(requestId);
    }
    return true;
  }, []);

  const dismissNotice = useCallback((id: string) => setNotices((ns) => ns.filter((n) => n.id !== id)), []);

  const failNextWrite = useCallback(() => { fakeServer.failNext = 'SERVER'; }, []);
  const setSlow = useCallback((on: boolean) => { fakeServer.slow = on; }, []);
  const setMaintenance = useCallback((on: boolean) => { fakeServer.maintenance = on; if (!on) void outboxRef.current?.kick(true); }, []);

  const value = useMemo<Store>(() => ({
    loaded, online, syncedAt, stale, clients, deadlines, undated, payments, activity, tasks, questions, inbox, consultations, notices, loadError, closed, fresh, pending, counters, cursor, conflict,
    client, closeDeadline, closeDeadlines, reopenDeadline, addPayment, removePayment, updatePayment, addClient, updatePhone, updateKved, updateIncome, updateEmail, addTask, addConsultation, toggleTask, completeTasks, updateTask, deleteTask, resolveConflict, revealPassword, answerQuestion, undoHeld, dismissNotice, reload, updateDeadline, updateDeadlines, renewKey, loadPaymentsMonth, refreshQuestions, decideInbox, loadClientCard, remindClient, remindPreview, cancelCloseNotice, createDeadline, templates, botLink, statement, archive, attention, month, inboxHide, aiAsk, photos,
    retry, discard, syncNow, external, setOnline, failNextWrite, setSlow, setMaintenance,
  }), [loaded, online, syncedAt, stale, clients, deadlines, undated, payments, activity, tasks, questions, inbox, consultations, notices, loadError, closed, fresh, pending, counters, cursor, conflict,
    client, closeDeadline, closeDeadlines, reopenDeadline, addPayment, removePayment, updatePayment, addClient, updatePhone, updateKved, updateIncome, updateEmail, addTask, addConsultation, toggleTask, completeTasks, updateTask, deleteTask, resolveConflict, revealPassword, answerQuestion, undoHeld, dismissNotice, reload, updateDeadline, updateDeadlines, renewKey, loadPaymentsMonth, refreshQuestions, decideInbox, loadClientCard, remindClient, remindPreview, cancelCloseNotice, createDeadline, templates, botLink, statement, archive, attention, month, inboxHide, aiAsk, photos,
    retry, discard, syncNow, external, setOnline, failNextWrite, setSlow, setMaintenance]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore вне StoreProvider');
  return s;
}
