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
import { canWrite, isLive } from '../config';
import { roMessage } from '../ui/readonly';
import type { WriteArea } from '../config';
import { kvAll, kvDelete, kvSet } from './idb';
import { Outbox } from './outbox';
import type { Counters, OutboxEvent, OutboxItem } from './outbox';
import { newRequestId } from './api';
import type { Change, Snapshot, WriteOp } from './api';
import type { Activity, Client, Deadline, Payment, Question, SaveState, Task } from './types';
import { TODAY, addDays, fmtDate } from '../lib/dates';
import { play } from '../lib/sound';

// Опрос изменений из таблицы: бриф — раз в 30–60 с. Квоты Apps Script дневного лимита на запросы не задают
// (developers.google.com/apps-script/guides/services/quotas), но одновременных выполнений — 30 на владельца.
const POLL_MS = 30_000;
const FRESH_MS = 2600;

export type CloseResult = { ok: true } | { ok: false; reason: string };
export type ExternalKind = 'payment' | 'key' | 'close' | 'phone';

/** Окончательный отказ таблицы (повтор не поможет): маме — что случилось, её словами. */
export interface Notice { id: string; text: string }

export interface Conflict {
  requestId: string;
  clientId: string;
  mine: string;
  theirs: string;
}

export interface ClosedEntry { deadline: Deadline; next: Deadline | null; save: SaveState; requestId: string; by: 'сайт' | 'бот' }

interface Store {
  loaded: boolean;
  online: boolean;
  clients: Client[];
  deadlines: Deadline[];
  payments: Payment[];
  activity: Activity[];
  tasks: Task[];
  questions: Question[];
  notices: Notice[];
  /** Таблица не отдала данные при открытии (живой режим): текст для мамы; null — всё в порядке. */
  loadError: string | null;
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
  reopenDeadline: (id: string) => void;
  addPayment: (p: Omit<Payment, 'id' | 'version' | 'source' | 'save'>, onSaved?: () => void) => string;
  removePayment: (id: string) => void;
  addClient: (c: Omit<Client, 'id' | 'version'>, onSaved?: (created: Deadline[], client: Client) => void) => Client;
  /** baseVersion — версия, которую мама видела, когда начала править (бриф, п. 6: конфликт). */
  updatePhone: (clientId: string, phone: string, baseVersion: number) => void;
  addTask: (t: Omit<Task, 'id' | 'version' | 'done'>) => void;
  /** Ответ на вопрос маме (questions.answer). */
  answerQuestion: (id: string, text: string, onSaved?: () => void) => void;
  dismissNotice: (id: string) => void;
  toggleTask: (id: string, done: boolean) => void;
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

const AREA_OF: Record<WriteOp['kind'], WriteArea> = {
  closeDeadline: 'deadlines', reopenDeadline: 'deadlines', addPayment: 'payments', cancelPayment: 'payments',
  addClient: 'clients', updateClient: 'clients', createTask: 'tasks', completeTask: 'tasks', answerQuestion: 'questions',
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
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  /** Вопросы, убранные с экрана до ответа сервера, — вернуть, если ответ не записался. */
  const answering = useRef(new Map<string, Question>());
  const [closed, setClosed] = useState<ClosedEntry[]>([]);
  const [fresh, setFresh] = useState<string[]>([]);
  const [pending, setPending] = useState<OutboxItem[]>([]);
  const [counters, setCounters] = useState<Counters>({ entered: 0, sent: 0, accepted: 0, rejected: 0, applied: 0, seenInTable: 0 });
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [cursor, setCursor] = useState(0);
  const cursorRef = useRef(0);
  const mine = useRef(new Set<string>());
  const paymentsRef = useRef<Payment[]>([]);
  useEffect(() => { paymentsRef.current = payments; }, [payments]);
  const callbacks = useRef(new Map<string, (changes: Change[], result: { notifyAt?: string | null }) => void>());
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
    for (const ch of changes) {
      const own = mine.current.has(ch.origin);
      if (own) outboxRef.current?.markSeen(ch.origin); else foreign.push(ch.id);
      if (ch.entity === 'client') {
        if (ch.op === 'delete') setClients((xs) => xs.filter((x) => x.id !== ch.id));
        else setClients((xs) => upsert(xs, ch.record as Client));
      } else if (ch.entity === 'deadline') {
        const rec = ch.record as Deadline | undefined;
        if (ch.op === 'delete') {
          // Ушёл в архив (ночью, когда со срока прошло > 3 дней) — из открытых убрать; «Закрыто сегодня» не трогаем.
          setDeadlines((xs) => xs.filter((x) => x.id !== ch.id));
        } else if (rec?.status === 'done') {
          // Закрыт (с сайта, в таблице или ботом): из открытых — в «Закрыто сегодня». Срок, закрытый раньше
          // (например, ушёл в архив — сервер шлёт его upsert'ом), в «Закрыто сегодня» не попадает.
          setDeadlines((xs) => xs.filter((x) => x.id !== ch.id));
          if (!own && rec.closedAt !== TODAY) continue;
          setClosed((cs) => (cs.some((c) => c.deadline.id === ch.id)
            ? cs.map((c) => (c.deadline.id === ch.id ? { ...c, save: 'saved' } : c))
            : [{ deadline: rec, next: null, save: 'saved', requestId: own ? ch.origin : `${ch.origin}-${ch.cursor}`, by: own ? 'сайт' : 'бот' }, ...cs]));
        } else if (rec) {
          // Открытый срок: новый, изменённый или возвращённый после отмены закрытия.
          setDeadlines((xs) => upsert(xs, rec));
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
  }, [markFresh]);

  /** Показать запись сразу — с пометкой, что она ещё не в таблице. */
  const applyOptimistic = useCallback((op: WriteOp) => {
    if (op.kind === 'closeDeadline') {
      setDeadlines((xs) => {
        const d = xs.find((x) => x.id === op.id);
        if (d) setClosed((cs) => [{ deadline: d, next: null, save: 'saving', requestId: op.requestId, by: 'сайт' }, ...cs.filter((c) => c.requestId !== op.requestId)]);
        return xs.filter((x) => x.id !== op.id);
      });
    } else if (op.kind === 'addPayment') {
      setPayments((xs) => upsert(xs, { ...op.payment, save: 'saving' }));
    } else if (op.kind === 'cancelPayment') {
      setPayments((xs) => xs.filter((x) => x.id !== op.id));
    } else if (op.kind === 'addClient') {
      setClients((xs) => upsert(xs, op.client));
    } else if (op.kind === 'updateClient') {
      setClients((xs) => xs.map((c) => (c.id === op.id ? { ...c, ...op.patch } : c)));
    } else if (op.kind === 'createTask') {
      setTasks((xs) => upsert(xs, op.task));
    } else if (op.kind === 'completeTask') {
      setTasks((xs) => xs.map((t) => (t.id === op.id ? { ...t, done: op.done } : t)));
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
      if (e.type === 'conflict' && op.kind === 'updateClient' && e.result.current && 'phone' in e.result.current) {
        setConflict({ requestId: op.requestId, clientId: op.id, mine: op.patch.phone ?? '', theirs: e.result.current.phone });
        play('attention');
        return;
      }
      // Отказ: показать честно. SERVER — запись остаётся «не сохранилось — повторить»;
      // PERIOD_OPEN / NOT_FOUND — повтор не поможет: экран возвращается к правде таблицы.
      const final = e.result.code !== 'SERVER';
      if (op.kind === 'closeDeadline') {
        setClosed((cs) => {
          const entry = cs.find((c) => c.requestId === op.requestId);
          if (entry && final) setDeadlines((xs) => upsert(xs, entry.deadline));
          return final ? cs.filter((c) => c.requestId !== op.requestId) : cs.map((c) => (c.requestId === op.requestId ? { ...c, save: 'failed' } : c));
        });
      }
      // Отмену платежа сервер не выполнил — платёж возвращается на экран таким, каким он стал в таблице.
      if (op.kind === 'cancelPayment' && e.result.current && 'kopecks' in e.result.current) {
        const cur = e.result.current;
        setPayments((xs) => upsert(xs, cur));
      }
      if (op.kind === 'addPayment') setPayments((xs) => xs.map((p) => (p.id === op.payment.id ? { ...p, save: 'failed' } : p)));
      // Ответ не записался: вопрос возвращается, если он всё ещё открыт (уже отвечен в Telegram — не возвращаем).
      if (op.kind === 'answerQuestion' && final) {
        const q = answering.current.get(op.requestId);
        const answered = e.result.current && 'options' in e.result.current && e.result.current.answer !== null;
        if (q && !answered) setQuestions((xs) => upsert(xs, q));
        answering.current.delete(op.requestId);
      }
      if (final) {
        void outboxRef.current?.discard(op.requestId);
        // Повтор не поможет — сказать, что случилось (иначе экран молча вернулся бы к таблице).
        setNotices((ns) => [...ns, { id: op.requestId, text: `${e.item.label}: ${e.result.message}` }]);
      }
      play('attention');
    };
  }, [applyChanges]);

  // Загрузка: снимок таблицы, затем очередь, оставшаяся с прошлого раза (показываем её поверх снимка).
  const applySnapshot = useCallback((snap: Snapshot) => {
    setClients(snap.clients); setPayments(snap.payments); setActivity(snap.activity); setTasks(snap.tasks); setQuestions(snap.questions);
    setDeadlines(snap.deadlines.filter((d) => d.status !== 'done'));
    setClosed(snap.deadlines.filter((d) => d.status === 'done' && d.closedAt === TODAY)
      .map((d) => ({ deadline: d, next: null, save: 'saved', requestId: `snap-${d.id}`, by: 'бот' })));
    cursorRef.current = snap.cursor; setCursor(snap.cursor);
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
      try {
        const snap = await api.snapshot();
        if (!alive) return;
        applySnapshot(snap);
        setLoadError(null);
      } catch (e) {
        setOnlineState(false);
        // Живой режим без снимка — пустые экраны вводили бы в заблуждение: показать, что случилось.
        if (alive && isLive()) setLoadError(e instanceof ApiError ? e.message : 'Таблица не ответила');
      }
      const left = await ob.load();
      for (const it of left) { mine.current.add(it.op.requestId); applyOptimistic(it.op); }
      if (alive) setLoaded(true);
    })();
    return () => { alive = false; };
  }, [applyOptimistic, applySnapshot, attempt]);

  const reload = useCallback(() => { setLoadError(null); setLoaded(false); setAttempt((n) => n + 1); }, []);

  const syncNow = useCallback(async () => {
    try {
      const res = await api.changesSince(cursorRef.current);
      setOnlineState(true);
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
      // Вход не удался — экран входа покажет App; это не обрыв связи.
      if (e instanceof ApiError && (e.code === 'AUTH_REQUIRED' || e.code === 'FORBIDDEN')) return;
      setOnlineState(false);
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

  const send = useCallback((op: WriteOp, label: string, onApplied?: (changes: Change[], result: { notifyAt?: string | null }) => void, showAfterMs = 0) => {
    // Раздел ещё только для просмотра (config.json → writes): в таблицу не пишем, говорим, где сделать.
    const area = AREA_OF[op.kind];
    if (!canWrite(area)) {
      setNotices((ns) => [...ns, { id: op.requestId, text: `${label}: ${roMessage(area)}` }]);
      return;
    }
    mine.current.add(op.requestId);
    if (onApplied) callbacks.current.set(op.requestId, onApplied);
    // Запись — в очередь сразу; на экране — сразу или после короткой анимации (таймер, не кадры анимации:
    // в фоновой вкладке кадры почти не идут, а запись ждать не должна).
    if (showAfterMs > 0) window.setTimeout(() => applyOptimistic(op), showAfterMs);
    else applyOptimistic(op);
    void outboxRef.current?.enqueue(op, label);
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

  const reopenDeadline = useCallback((id: string) => {
    const entry = closed.find((c) => c.deadline.id === id);
    if (!entry) return;
    setClosed((cs) => cs.filter((c) => c !== entry));
    setDeadlines((xs) => upsert(xs.filter((x) => x.id !== entry.next?.id), entry.deadline));
    // Отмена — тоже запись в таблицу; если закрытие ещё в очереди — просто убираем его оттуда.
    if (outboxRef.current?.has(entry.requestId)) { void outboxRef.current.discard(entry.requestId); return; }
    send({ kind: 'reopenDeadline', requestId: newRequestId(), id, undoOf: entry.requestId }, `Отменить закрытие «${entry.deadline.what}»`);
  }, [closed, send]);

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

  const updatePhone = useCallback((clientId: string, phone: string, baseVersion: number) => {
    send({ kind: 'updateClient', requestId: newRequestId(), id: clientId, baseVersion, patch: { phone } }, 'Телефон клиента');
  }, [send]);

  const addTask = useCallback((t: Omit<Task, 'id' | 'version' | 'done'>) => {
    const requestId = newRequestId();
    send({ kind: 'createTask', requestId, task: { ...t, id: requestId, version: 1, done: false } }, `Задача «${t.text}»`);
  }, [send]);

  const toggleTask = useCallback((id: string, done: boolean) => {
    send({ kind: 'completeTask', requestId: newRequestId(), id, done }, done ? 'Задача сделана' : 'Задача снова в работе');
  }, [send]);

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

  const answerQuestion = useCallback((id: string, text: string, onSaved?: () => void) => {
    send({ kind: 'answerQuestion', requestId: newRequestId(), id, text }, 'Ответ на вопрос', () => onSaved?.());
  }, [send]);

  const dismissNotice = useCallback((id: string) => setNotices((ns) => ns.filter((n) => n.id !== id)), []);

  const failNextWrite = useCallback(() => { fakeServer.failNext = 'SERVER'; }, []);
  const setSlow = useCallback((on: boolean) => { fakeServer.slow = on; }, []);
  const setMaintenance = useCallback((on: boolean) => { fakeServer.maintenance = on; if (!on) void outboxRef.current?.kick(true); }, []);

  const value = useMemo<Store>(() => ({
    loaded, online, clients, deadlines, payments, activity, tasks, questions, notices, loadError, closed, fresh, pending, counters, cursor, conflict,
    client, closeDeadline, reopenDeadline, addPayment, removePayment, addClient, updatePhone, addTask, toggleTask, resolveConflict, revealPassword, answerQuestion, dismissNotice, reload,
    retry, discard, syncNow, external, setOnline, failNextWrite, setSlow, setMaintenance,
  }), [loaded, online, clients, deadlines, payments, activity, tasks, questions, notices, loadError, closed, fresh, pending, counters, cursor, conflict,
    client, closeDeadline, reopenDeadline, addPayment, removePayment, addClient, updatePhone, addTask, toggleTask, resolveConflict, revealPassword, answerQuestion, dismissNotice, reload,
    retry, discard, syncNow, external, setOnline, failNextWrite, setSlow, setMaintenance]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore вне StoreProvider');
  return s;
}
