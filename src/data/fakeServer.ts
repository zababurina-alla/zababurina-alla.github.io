// Выдуманный сервер-таблица для прототипа: ведёт себя как будущий API в Apps Script.
// — запись подтверждается с задержкой; — автоцикл создаёт следующий период; — проверка «период закончился»;
// — версии записей и ошибка CONFLICT; — журнал изменений с курсором; — повтор того же requestId не создаёт дубль.
// Рычаги отладки (обрыв связи, отказ, правка извне) — для кнопок в режиме отладки.
import { ACTIVITY, CLIENTS, DEADLINES, PAYMENTS, TASKS } from './fake';
import type { CabinetApi, Change, Entity, Snapshot, WriteOp, WriteResult } from './api';
import type { Activity, Client, Deadline, Payment, Task } from './types';
import { TODAY, addDays, daysBetween, fmtDate } from '../lib/dates';
import { formatMoney } from '../lib/money';

// Задержки прототипа. Живые числа Apps Script — замер на этапе 4; эти — наши, не проверены.
const WRITE_MS = 900;
const READ_MS = 250;

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const QUARTERS = ['I', 'II', 'III', 'IV'];

/** Автоцикл (как в таблице): следующий период того же обязательства. */
export function nextPeriod(d: Deadline, id: string): Deadline | null {
  const q = /(I{1,3}|IV) (квартал|кв\.)/.exec(d.what);
  if (q?.[1]) {
    const nextQ = QUARTERS[(QUARTERS.indexOf(q[1]) + 1) % 4] ?? 'I';
    return { ...d, id, what: d.what.replace(q[1], nextQ), due: addDays(d.due, 92), periodEnds: null, version: 1 };
  }
  const m = MONTHS.findIndex((name) => d.what.toLowerCase().includes(name));
  if (m >= 0) {
    return { ...d, id, what: d.what.replace(new RegExp(MONTHS[m] ?? '', 'i'), MONTHS[(m + 1) % 12] ?? ''), due: addDays(d.due, 30), periodEnds: null, version: 1 };
  }
  return null;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => `${TODAY}T${new Date().toTimeString().slice(0, 5)}`;
const short = (name: string) => name.split(' ').slice(0, 2).join(' ');

class FakeServer implements CabinetApi {
  private clients = new Map<string, Client>(CLIENTS.map((c) => [c.id, { ...c }]));
  private deadlines = new Map<string, Deadline>(DEADLINES.map((d) => [d.id, { ...d }]));
  private payments = new Map<string, Payment>(PAYMENTS.map((p) => [p.id, { ...p }]));
  private activity: Activity[] = ACTIVITY.map((a) => ({ ...a }));
  private tasks = new Map<string, Task>(TASKS.map((t) => [t.id, { ...t }]));
  private log: Change[] = [];
  private cursor = 100;
  /** Ответы на уже выполненные requestId — повтор из очереди возвращает тот же ответ (идемпотентность). */
  private done = new Map<string, WriteResult>();
  /** Что закрыл requestId — для отмены (удалить созданный автоциклом период, вернуть закрытый). */
  private closedBy = new Map<string, { closed: Deadline; next: Deadline | null }>();

  // Рычаги отладки
  online = true;
  failNext: 'SERVER' | null = null;

  private record(entity: Entity, op: 'upsert' | 'delete', id: string, origin: string, rec?: Change['record']): Change {
    const ch: Change = { cursor: ++this.cursor, entity, op, id, origin, ...(rec ? { record: rec } : {}) };
    this.log.push(ch);
    return ch;
  }

  private act(text: string, origin: string, source: Activity['source']): Change {
    const a: Activity = { id: `a${this.cursor + 1}`, when: now(), source, text };
    this.activity.unshift(a);
    return this.record('activity', 'upsert', a.id, origin, a);
  }

  async snapshot(): Promise<Snapshot> {
    await wait(READ_MS);
    if (!this.online) throw new Error('NETWORK');
    return {
      clients: [...this.clients.values()].map((c) => ({ ...c })),
      deadlines: [...this.deadlines.values()].map((d) => ({ ...d })),
      payments: [...this.payments.values()].map((p) => ({ ...p })),
      activity: this.activity.map((a) => ({ ...a })),
      tasks: [...this.tasks.values()].map((t) => ({ ...t })),
      cursor: this.cursor,
    };
  }

  async changesSince(cursor: number) {
    await wait(READ_MS);
    if (!this.online) throw new Error('NETWORK');
    return { changes: this.log.filter((c) => c.cursor > cursor), cursor: this.cursor };
  }

  async write(op: WriteOp): Promise<WriteResult> {
    await wait(WRITE_MS);
    if (!this.online) return { ok: false, code: 'NETWORK', message: 'Нет связи с таблицей' };
    const repeat = this.done.get(op.requestId);
    if (repeat) return repeat;
    if (this.failNext) {
      this.failNext = null;
      return { ok: false, code: 'SERVER', message: 'Таблица не ответила вовремя — попробуйте ещё раз' };
    }
    const res = this.apply(op);
    if (res.ok) this.done.set(op.requestId, res);
    return res;
  }

  private apply(op: WriteOp): WriteResult {
    const o = op.requestId;
    switch (op.kind) {
      case 'closeDeadline': {
        const d = this.deadlines.get(op.id);
        if (!d) return { ok: false, code: 'NOT_FOUND', message: 'Этого срока уже нет в таблице — возможно, его закрыли через бота' };
        if (d.version !== op.baseVersion) return { ok: false, code: 'CONFLICT', message: 'Срок изменился в таблице', current: { ...d } };
        if (d.periodEnds && daysBetween(TODAY, d.periodEnds) > 0) {
          return { ok: false, code: 'PERIOD_OPEN', message: `Период ещё не закончился — закрыть можно с ${fmtDate(d.periodEnds)}` };
        }
        const next = nextPeriod(d, `${d.id}-${this.cursor + 1}`);
        this.deadlines.delete(d.id);
        const changes = [this.record('deadline', 'delete', d.id, o)];
        if (next) { this.deadlines.set(next.id, next); changes.push(this.record('deadline', 'upsert', next.id, o, next)); }
        this.closedBy.set(o, { closed: d, next });
        const name = this.clients.get(d.clientId)?.name ?? '';
        changes.push(this.act(`Закрыт срок «${d.what}» — ${short(name)}${next ? `. Следующий создан: до ${fmtDate(next.due)}` : ''}`, o, 'сайт'));
        return { ok: true, changes, cursor: this.cursor };
      }
      case 'reopenDeadline': {
        const was = this.closedBy.get(op.undoOf);
        if (!was) return { ok: false, code: 'NOT_FOUND', message: 'Нечего отменять' };
        const changes: Change[] = [];
        if (was.next) { this.deadlines.delete(was.next.id); changes.push(this.record('deadline', 'delete', was.next.id, o)); }
        const back = { ...was.closed, version: was.closed.version + 1 };
        this.deadlines.set(back.id, back);
        changes.push(this.record('deadline', 'upsert', back.id, o, back));
        changes.push(this.act(`Отменено закрытие «${back.what}»`, o, 'сайт'));
        return { ok: true, changes, cursor: this.cursor };
      }
      case 'addPayment': {
        const p = { ...op.payment, source: 'сайт' as const };
        delete p.save;
        this.payments.set(p.id, p);
        const name = this.clients.get(p.clientId)?.name ?? '';
        const changes = [this.record('payment', 'upsert', p.id, o, p), this.act(`Платёж ${formatMoney(p.kopecks)} от ${short(name)} записан`, o, 'сайт')];
        return { ok: true, changes, cursor: this.cursor };
      }
      case 'cancelPayment': {
        if (!this.payments.delete(op.id)) return { ok: false, code: 'NOT_FOUND', message: 'Этого платежа уже нет' };
        return { ok: true, changes: [this.record('payment', 'delete', op.id, o), this.act('Платёж отменён', o, 'сайт')], cursor: this.cursor };
      }
      case 'addClient': {
        const c = { ...op.client, version: 1 };
        this.clients.set(c.id, c);
        // Что создаёт система для нового клиента — в прототипе по типу; на живых данных — шаблоны сроков таблицы.
        const base = { clientId: c.id, kopecks: null, periodEnds: null, version: 1 };
        const made: Deadline[] = c.kind === 'tov'
          ? [{ ...base, id: `${c.id}-1`, what: 'Податковий розрахунок, IV квартал', due: '2027-02-09' }]
          : [
            { ...base, id: `${c.id}-1`, what: 'ЄП за ноябрь', due: '2026-11-20' },
            { ...base, id: `${c.id}-2`, what: 'ЄСВ за IV квартал', due: '2027-01-20' },
            { ...base, id: `${c.id}-3`, what: 'Декларація платника ЄП, 2026 рік', due: '2027-03-01' },
          ];
        const changes = [this.record('client', 'upsert', c.id, o, c)];
        for (const d of made) { this.deadlines.set(d.id, d); changes.push(this.record('deadline', 'upsert', d.id, o, d)); }
        changes.push(this.act(`Добавлен клиент ${c.name}. Создано сроков: ${made.length}`, o, 'сайт'));
        return { ok: true, changes, cursor: this.cursor };
      }
      case 'createTask': {
        const t = { ...op.task, version: 1 };
        this.tasks.set(t.id, t);
        return { ok: true, changes: [this.record('task', 'upsert', t.id, o, t)], cursor: this.cursor };
      }
      case 'completeTask': {
        const t = this.tasks.get(op.id);
        if (!t) return { ok: false, code: 'NOT_FOUND', message: 'Этой задачи уже нет' };
        const upd = { ...t, done: op.done, version: t.version + 1 };
        this.tasks.set(t.id, upd);
        return { ok: true, changes: [this.record('task', 'upsert', t.id, o, upd)], cursor: this.cursor };
      }
      case 'updateClient': {
        const c = this.clients.get(op.id);
        if (!c) return { ok: false, code: 'NOT_FOUND', message: 'Клиента нет в таблице' };
        if (c.version !== op.baseVersion) return { ok: false, code: 'CONFLICT', message: 'Карточка изменилась в таблице', current: { ...c } };
        const upd = { ...c, ...op.patch, version: c.version + 1 };
        this.clients.set(c.id, upd);
        return { ok: true, changes: [this.record('client', 'upsert', c.id, o, upd), this.act(`Изменена карточка: ${short(c.name)}`, o, 'сайт')], cursor: this.cursor };
      }
    }
  }

  // ── Правки «извне» для режима отладки: так выглядят изменения в таблице и через бота ──
  external(kind: 'payment' | 'key' | 'close' | 'phone'): string {
    if (kind === 'payment') {
      const p: Payment = { id: `p-bot-${this.cursor + 1}`, clientId: 'c5', kopecks: 320000, period: 'III квартал 2026', method: 'на счёт', date: TODAY, source: 'бот' };
      this.payments.set(p.id, p);
      this.record('payment', 'upsert', p.id, 'бот', p);
      this.act('Платёж 3 200,00 ₴ от Ясенко Миколы записан', 'бот', 'бот');
      return 'Через бота: платёж 3 200,00 ₴ от Ясенко Миколы';
    }
    if (kind === 'key' || kind === 'phone') {
      const c = this.clients.get('c1');
      if (!c) return '';
      const upd = kind === 'key' ? { ...c, keyUntil: '2027-10-19', version: c.version + 1 } : { ...c, phone: '+380 00 000 99 99', version: c.version + 1 };
      this.clients.set(c.id, upd);
      this.record('client', 'upsert', c.id, 'таблица', upd);
      this.act(kind === 'key' ? 'Ключ ЭЦП Ромашко Олены продлён до 19.10.2027' : 'Телефон Ромашко Олены изменён в таблице', 'таблица', 'таблица');
      return kind === 'key' ? 'Из таблицы: ключ ЭЦП Ромашко Олены продлён до 19.10.2027' : 'Из таблицы: изменён телефон Ромашко Олены';
    }
    const d = [...this.deadlines.values()].filter((x) => !x.periodEnds).sort((a, b) => a.due.localeCompare(b.due))[0];
    if (!d) return 'Нет сроков, которые можно закрыть';
    this.deadlines.delete(d.id);
    this.record('deadline', 'delete', d.id, 'бот');
    const name = this.clients.get(d.clientId)?.name ?? '';
    this.act(`Закрыт срок «${d.what}» — ${short(name)}`, 'бот', 'бот');
    return `Через бота: закрыт срок «${d.what}» — ${short(name)}`;
  }
}

export const fakeServer = new FakeServer();
