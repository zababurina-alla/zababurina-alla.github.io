// Хранилище прототипа. Имитирует сервер-таблицу: задержку подтверждения записи и автоцикл сроков.
// На этапе 2 станет адаптером с тем же интерфейсом, что API; на этапе 4 заменится живым адаптером.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ACTIVITY, CLIENTS, DEADLINES, PAYMENTS } from './fake';
import type { Activity, Client, Deadline, Payment, SaveState } from './types';
import { TODAY, addDays, daysBetween, fmtDate } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { play } from '../lib/sound';

// Задержка «записи в таблицу» в прототипе. Замер у Apps Script — на этапе 3; сейчас число наше, не проверено.
const FAKE_SAVE_MS = 900;
// Имитация первой загрузки из таблицы (прототип). Живое время ответа API — замер на этапе 4.
const FAKE_LOAD_MS = 700;
// Сколько подсвечивается запись, пришедшая из таблицы или бота.
const FRESH_MS = 2600;

export type IncomingKind = 'payment' | 'key' | 'close';

export type CloseResult =
  | { ok: true; next: Deadline | null }
  | { ok: false; reason: string };

interface Store {
  clients: Client[];
  deadlines: Deadline[];
  payments: Payment[];
  activity: Activity[];
  closed: { deadline: Deadline; next: Deadline | null; save: SaveState }[];
  saving: Record<string, SaveState>;
  client: (id: string) => Client | undefined;
  closeDeadline: (id: string, onSaved?: () => void) => CloseResult;
  reopenDeadline: (id: string) => void;
  addPayment: (p: Omit<Payment, 'id' | 'source' | 'save'>, onSaved?: () => void) => string;
  removePayment: (id: string) => void;
  addClient: (c: Omit<Client, 'id' | 'version'>) => { client: Client; created: Deadline[] };
  /** Данные загружены из таблицы (в прототипе — через FAKE_LOAD_MS). */
  loaded: boolean;
  /** id записей, которые только что пришли из таблицы или бота — экран их мягко подсвечивает. */
  fresh: string[];
  /** Режим отладки: имитация правки в таблице или через бота. Возвращает текст для уведомления. */
  simulateIncoming: (kind: IncomingKind) => string;
}

const Ctx = createContext<Store | null>(null);

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const QUARTERS = ['I', 'II', 'III', 'IV'];

/** Автоцикл (как в таблице): после закрытия создаётся следующий период того же обязательства. */
function nextPeriod(d: Deadline): Deadline | null {
  const q = /(I{1,3}|IV) (квартал|кв\.)/.exec(d.what);
  if (q?.[1]) {
    const i = QUARTERS.indexOf(q[1]);
    const nextQ = QUARTERS[(i + 1) % 4] ?? 'I';
    return { ...d, id: `${d.id}-n`, what: d.what.replace(q[1], nextQ), due: addDays(d.due, 92), periodEnds: null, version: 1 };
  }
  const m = MONTHS.findIndex((name) => d.what.toLowerCase().includes(name));
  if (m >= 0) {
    const nextName = MONTHS[(m + 1) % 12] ?? '';
    return { ...d, id: `${d.id}-n`, what: d.what.replace(new RegExp(MONTHS[m] ?? '', 'i'), nextName), due: addDays(d.due, 30), periodEnds: null, version: 1 };
  }
  return null;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [clients, setClients] = useState(CLIENTS);
  const [deadlines, setDeadlines] = useState(DEADLINES);
  const [payments, setPayments] = useState(PAYMENTS);
  const [activity, setActivity] = useState(ACTIVITY);
  const [closed, setClosed] = useState<Store['closed']>([]);
  const [saving, setSaving] = useState<Record<string, SaveState>>({});
  const [loaded, setLoaded] = useState(false);
  const [fresh, setFresh] = useState<string[]>([]);

  useEffect(() => {
    const t = window.setTimeout(() => setLoaded(true), FAKE_LOAD_MS);
    return () => window.clearTimeout(t);
  }, []);

  const markFresh = useCallback((id: string) => {
    setFresh((xs) => [...xs, id]);
    window.setTimeout(() => setFresh((xs) => xs.filter((x) => x !== id)), FRESH_MS);
  }, []);

  const client = useCallback((id: string) => clients.find((c) => c.id === id), [clients]);

  const log = useCallback((text: string) => {
    setActivity((xs) => [{ id: `a${Date.now()}`, when: `${TODAY}T${new Date().toTimeString().slice(0, 5)}`, source: 'сайт', text }, ...xs]);
  }, []);

  const confirm = useCallback((id: string, after?: () => void) => {
    setSaving((s) => ({ ...s, [id]: 'saving' }));
    window.setTimeout(() => {
      setSaving((s) => ({ ...s, [id]: 'saved' }));
      after?.();
    }, FAKE_SAVE_MS);
  }, []);

  const closeDeadline = useCallback((id: string, onSaved?: () => void): CloseResult => {
    const d = deadlines.find((x) => x.id === id);
    if (!d) return { ok: false, reason: 'Срок не найден — обновите страницу' };
    if (d.periodEnds && daysBetween(TODAY, d.periodEnds) > 0) {
      return { ok: false, reason: `Период ещё не закончился — закрыть этот срок можно с ${fmtDate(d.periodEnds)}` };
    }
    const next = nextPeriod(d);
    setDeadlines((xs) => [...xs.filter((x) => x.id !== id), ...(next ? [next] : [])]);
    setClosed((xs) => [{ deadline: d, next, save: 'saving' }, ...xs]);
    confirm(id, () => {
      setClosed((xs) => xs.map((x) => (x.deadline.id === id ? { ...x, save: 'saved' } : x)));
      onSaved?.();
    });
    const name = clients.find((c) => c.id === d.clientId)?.name ?? '';
    log(`Закрыт срок «${d.what}» — ${name}${next ? `. Следующий создан: до ${fmtDate(next.due)}` : ''}`);
    return { ok: true, next };
  }, [deadlines, clients, confirm, log]);

  const reopenDeadline = useCallback((id: string) => {
    const entry = closed.find((x) => x.deadline.id === id);
    if (!entry) return;
    setClosed((xs) => xs.filter((x) => x.deadline.id !== id));
    setDeadlines((xs) => [...xs.filter((x) => x.id !== entry.next?.id), entry.deadline]);
    confirm(`${id}-undo`);
    log(`Отменено закрытие «${entry.deadline.what}»`);
  }, [closed, confirm, log]);

  const addPayment = useCallback((p: Omit<Payment, 'id' | 'source' | 'save'>, onSaved?: () => void) => {
    const id = `p${Date.now()}`;
    setPayments((xs) => [{ ...p, id, source: 'сайт', save: 'saving' }, ...xs]);
    confirm(id, () => {
      setPayments((xs) => xs.map((x) => (x.id === id ? { ...x, save: 'saved' } : x)));
      onSaved?.();
    });
    const name = clients.find((c) => c.id === p.clientId)?.name ?? '';
    log(`Платёж ${formatMoney(p.kopecks)} от ${name} записан`);
    return id;
  }, [clients, confirm, log]);

  const removePayment = useCallback((id: string) => {
    setPayments((xs) => xs.filter((x) => x.id !== id));
    confirm(`${id}-undo`);
    log('Платёж отменён');
  }, [confirm, log]);

  const addClient = useCallback((data: Omit<Client, 'id' | 'version'>) => {
    const newClient: Client = { ...data, id: `c${Date.now()}`, version: 1 };
    // Что создаст система (автоцикл) для нового клиента — в прототипе по типу; на живых данных это ответ сервера.
    const base = { clientId: newClient.id, kopecks: null, periodEnds: null, version: 1 };
    const created: Deadline[] = data.kind === 'tov'
      ? [{ ...base, id: `${newClient.id}-1`, what: 'Податковий розрахунок, IV квартал', due: '2027-02-09' }]
      : [
        { ...base, id: `${newClient.id}-1`, what: 'ЄП за ноябрь', due: '2026-11-20' },
        { ...base, id: `${newClient.id}-2`, what: 'ЄСВ за IV квартал', due: '2027-01-20' },
        { ...base, id: `${newClient.id}-3`, what: 'Декларація платника ЄП, 2026 рік', due: '2027-03-01' },
      ];
    setClients((xs) => [newClient, ...xs]);
    setDeadlines((xs) => [...xs, ...created]);
    confirm(newClient.id);
    log(`Добавлен клиент ${newClient.name}. Создано сроков: ${created.length}`);
    return { client: newClient, created };
  }, [confirm, log]);

  const simulateIncoming = useCallback((kind: IncomingKind): string => {
    const now = `${TODAY}T${new Date().toTimeString().slice(0, 5)}`;
    play('incoming');
    if (kind === 'payment') {
      const id = `p${Date.now()}`;
      setPayments((xs) => [{ id, clientId: 'c5', kopecks: 320000, period: 'III квартал 2026', method: 'на счёт', date: TODAY, source: 'бот' }, ...xs]);
      setActivity((xs) => [{ id: `a${id}`, when: now, source: 'бот', text: 'Платёж 3 200,00 ₴ от Ясенко Миколы записан' }, ...xs]);
      markFresh(id); markFresh(`a${id}`);
      return 'Через бота: платёж 3 200,00 ₴ от Ясенко Миколы';
    }
    if (kind === 'key') {
      setClients((xs) => xs.map((c) => (c.id === 'c1' ? { ...c, keyUntil: '2027-10-19', version: c.version + 1 } : c)));
      const aid = `a${Date.now()}`;
      setActivity((xs) => [{ id: aid, when: now, source: 'таблица', text: 'Ключ ЭЦП Ромашко Олены продлён до 19.10.2027' }, ...xs]);
      markFresh('c1'); markFresh(aid);
      return 'Из таблицы: ключ ЭЦП Ромашко Олены продлён до 19.10.2027';
    }
    // Бот закрыл срок: строка сначала подсвечивается, потом уходит (видно, что изменилось и где).
    const d = deadlines.filter((x) => !x.periodEnds).sort((a, b) => a.due.localeCompare(b.due))[0];
    if (!d) return 'Нет сроков, которые можно закрыть';
    markFresh(d.id);
    const name = clients.find((c) => c.id === d.clientId)?.name.split(' ').slice(0, 2).join(' ') ?? '';
    window.setTimeout(() => {
      setDeadlines((xs) => xs.filter((x) => x.id !== d.id));
      setClosed((xs) => [{ deadline: d, next: null, save: 'saved' }, ...xs]);
      const aid = `a${Date.now()}`;
      setActivity((xs) => [{ id: aid, when: now, source: 'бот', text: `Закрыт срок «${d.what}» — ${name}` }, ...xs]);
      markFresh(aid);
    }, 1100);
    return `Через бота: закрыт срок «${d.what}» — ${name}`;
  }, [clients, deadlines, markFresh]);

  const value = useMemo<Store>(() => ({
    clients, deadlines, payments, activity, closed, saving, client,
    closeDeadline, reopenDeadline, addPayment, removePayment, addClient, loaded, fresh, simulateIncoming,
  }), [clients, deadlines, payments, activity, closed, saving, client, closeDeadline, reopenDeadline, addPayment, removePayment, addClient, loaded, fresh, simulateIncoming]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore вне StoreProvider');
  return s;
}
