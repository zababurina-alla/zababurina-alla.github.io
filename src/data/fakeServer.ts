// Выдуманный сервер-таблица для прототипа: ведёт себя как будущий API в Apps Script.
// — запись подтверждается с задержкой; — автоцикл создаёт следующий период; — проверка «период закончился»;
// — версии записей и ошибка CONFLICT; — журнал изменений с курсором; — повтор того же requestId не создаёт дубль.
// Рычаги отладки (обрыв связи, отказ, правка извне) — для кнопок в режиме отладки.
import { ACTIVITY, CLIENTS, DEADLINES, INBOX, KVEDS, PAYMENTS, QUESTIONS, RATES, TASKS } from './fake';
import type { CabinetApi, Change, ClientCard, Entity, KvedFound, Snapshot, WriteOp, WriteResult } from './api';
import type { Activity, Client, Deadline, InboxItem, KvedItem, Payment, Question, Rates, Task } from './types';
import { fold } from '../lib/search';
import { TODAY, addDays, endOfMonth, fmtDate, fmtDue } from '../lib/dates';
import { formatPayMoney } from '../lib/money';

// Задержки прототипа: запись 1–3 с — по оценке архитектора «Мамы CRM» (p50 1–5 с, p95 до 10–12 с; не замер).
// Режим отладки «медленная таблица» — 12 с (верхняя оценка p95).
const WRITE_MS: [number, number] = [1000, 3000];
const SLOW_MS = 12000;
const READ_MS = 250;

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const QUARTERS = ['I', 'II', 'III', 'IV'];

const nextMonthEnd = (iso: string) => endOfMonth(addDays(iso, 1));

/** Автоцикл (как в таблице): следующий период того же обязательства. */
export function nextPeriod(d: Deadline, id: string, version: number): Deadline | null {
  const base = { ...d, id, version, status: 'new' as const, closedAt: null };
  const q = /(I{1,3}|IV) (квартал|кв\.)/.exec(d.what);
  if (q?.[1]) {
    const nextQ = QUARTERS[(QUARTERS.indexOf(q[1]) + 1) % 4] ?? 'I';
    const pe = d.periodEnd ? nextMonthEnd(nextMonthEnd(nextMonthEnd(d.periodEnd))) : null;
    return { ...base, what: d.what.replace(q[1], nextQ), due: addDays(d.due ?? TODAY, 92), periodEnd: pe };
  }
  const m = MONTHS.findIndex((name) => d.what.toLowerCase().includes(name));
  if (m >= 0) {
    return { ...base, what: d.what.replace(new RegExp(MONTHS[m] ?? '', 'i'), MONTHS[(m + 1) % 12] ?? ''), due: addDays(d.due ?? TODAY, 30),
      periodEnd: d.periodEnd ? nextMonthEnd(d.periodEnd) : null };
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
  private inbox = new Map<string, InboxItem>(INBOX.map((i) => [i.id, { ...i }]));
  private questions = new Map<string, Question>(QUESTIONS.map((q) => [q.id, { ...q, options: [...q.options] }]));
  private log: Change[] = [];
  private cursor = 100;
  /** Ответы на уже выполненные requestId — повтор из очереди возвращает тот же ответ (идемпотентность). */
  private done = new Map<string, WriteResult>();
  /** Что закрыл requestId — для отмены (удалить созданный автоциклом период, вернуть закрытый). */
  private closedBy = new Map<string, { closed: Deadline; next: Deadline | null }>();

  // Рычаги отладки
  online = true;
  failNext: 'SERVER' | null = null;
  slow = false;
  maintenance = false;
  private nextClientNo = 200;

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
      questions: [...this.questions.values()].filter((q) => q.answer === null).map((q) => ({ ...q, options: [...q.options] })),
      inbox: [...this.inbox.values()].map((i) => ({ ...i })),
      cursor: this.cursor,
    };
  }

  async changesSince(cursor: number) {
    await wait(READ_MS);
    if (!this.online) throw new Error('NETWORK');
    return { changes: this.log.filter((c) => c.cursor > cursor), cursor: this.cursor };
  }

  async write(op: WriteOp): Promise<WriteResult> {
    await wait(this.slow ? SLOW_MS : WRITE_MS[0] + Math.random() * (WRITE_MS[1] - WRITE_MS[0]));
    if (!this.online) return { ok: false, code: 'NETWORK', message: 'Нет связи с таблицей' };
    // Обслуживание — по флагу ночных задач, а не по часам (v2.1, уточнение 1); в прототипе retryAt через 20 с.
    if (this.maintenance) {
      return { ok: false, code: 'MAINTENANCE', message: 'Ночное обслуживание таблицы (обычно 03:00–04:30) — запись отправлю, когда закончится',
        retryAt: new Date(Date.now() + 20_000).toISOString() };
    }
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
        if (!d || d.status === 'done') return { ok: false, code: 'NOT_FOUND', message: 'Этот срок уже закрыт — возможно, через бота или в таблице' };
        if (d.version !== op.baseVersion) return { ok: false, code: 'CONFLICT', message: 'Срок изменился в таблице', current: { ...d } };
        // Закрыть можно с дня после последнего дня периода (контракт v2, п. 22).
        if (d.periodEnd && TODAY <= d.periodEnd) {
          return { ok: false, code: 'PERIOD_OPEN', message: `Период ещё не закончился — закрыть можно с ${fmtDate(addDays(d.periodEnd, 1))}` };
        }
        // Закрытие — upsert со статусом «done» (п. 20); в архив срок уходит ночью, когда со СРОКА прошло > 3 дней.
        const done: Deadline = { ...d, status: 'done', closedAt: TODAY, version: this.cursor + 1 };
        this.deadlines.set(d.id, done);
        const changes = [this.record('deadline', 'upsert', d.id, o, done)];
        const next = nextPeriod(d, `D-${this.cursor + 2}`, this.cursor + 2);
        if (next) { this.deadlines.set(next.id, next); changes.push(this.record('deadline', 'upsert', next.id, o, next)); }
        this.closedBy.set(o, { closed: d, next });
        const name = this.clients.get(d.clientId)?.name ?? '';
        changes.push(this.act(`Закрыт срок «${d.what}» — ${short(name)}${next ? `. Следующий создан: до ${fmtDue(next.due)}` : ''}`, o, 'сайт'));
        // Уведомления клиенту и маме — через 2 мин, если закрытие не отменили (п. 31).
        const notifyAt = new Date(Date.now() + 120_000).toISOString();
        return { ok: true, changes, cursor: this.cursor, notifyAt };
      }
      case 'closeDeadlines': {
        // Как deadlines.closeMany: каждый срок — как отдельное закрытие; отказ по одному не мешает остальным.
        const changes: Change[] = [];
        const failed: NonNullable<Extract<WriteResult, { ok: true }>['failed']> = [];
        for (const it of op.items) {
          const r = this.apply({ kind: 'closeDeadline', requestId: `${o}#${it.id}`, id: it.id, baseVersion: it.baseVersion });
          if (r.ok) changes.push(...r.changes);
          else failed.push({ id: it.id, code: r.code, message: r.message, ...(r.current && 'periodicity' in r.current ? { current: r.current } : {}) });
        }
        return { ok: true, changes, cursor: this.cursor, failed };
      }
      case 'reopenDeadline': {
        // Отмена одного из пакета: undoOf — requestId пакета, срок — по id.
        const was = this.closedBy.get(op.undoOf) ?? this.closedBy.get(`${op.undoOf}#${op.id}`);
        if (!was) return { ok: false, code: 'NOT_FOUND', message: 'Нечего отменять' };
        const changes: Change[] = [];
        if (was.next) { this.deadlines.delete(was.next.id); changes.push(this.record('deadline', 'delete', was.next.id, o)); }
        const back: Deadline = { ...was.closed, status: 'new', closedAt: null, version: this.cursor + 1 };
        this.deadlines.set(back.id, back);
        changes.push(this.record('deadline', 'upsert', back.id, o, back));
        changes.push(this.act(`Отменено закрытие «${back.what}»`, o, 'сайт'));
        return { ok: true, changes, cursor: this.cursor };
      }
      case 'addPayment': {
        const p = { ...op.payment, source: 'сайт' as const, version: this.cursor + 1 };
        delete p.save;
        this.payments.set(p.id, p);
        const name = this.clients.get(p.clientId)?.name ?? '';
        const changes = [this.record('payment', 'upsert', p.id, o, p), this.act(`Платёж ${formatPayMoney(p.kopecks)} от ${short(name)} записан`, o, 'сайт')];
        return { ok: true, changes, cursor: this.cursor };
      }
      case 'cancelPayment': {
        const cur = this.payments.get(op.id);
        if (!cur) return { ok: false, code: 'NOT_FOUND', message: 'Этого платежа уже нет' };
        // Строку уже поправили в таблице — отменять нельзя молча (как «↩️ Отменить» в боте; v2.1, уточнение 7).
        if (cur.version !== op.baseVersion) return { ok: false, code: 'CONFLICT', message: 'Платёж изменили в таблице — отмена не выполнена', current: { ...cur } };
        this.payments.delete(op.id);
        return { ok: true, changes: [this.record('payment', 'delete', op.id, o), this.act('Платёж отменён', o, 'сайт')], cursor: this.cursor };
      }
      case 'addClient': {
        // id клиента выдаёт сервер (номер в колонке A), не браузер (п. 8).
        const c: Client = { ...op.client, id: `C-${this.nextClientNo++}`, version: this.cursor + 1 };
        this.clients.set(c.id, c);
        // Что создаёт система для нового клиента — в прототипе по типу; на живых данных — шаблоны сроков таблицы.
        const base = { clientId: c.id, status: 'new' as const, closedAt: null, version: this.cursor + 1 };
        const made: Deadline[] = c.kind === 'tov3' || c.kind === 'tovGeneral'
          ? [{ ...base, id: `${c.id}-1`, what: 'Податковий розрахунок, IV квартал', due: '2027-02-09', periodicity: 'quarter', periodEnd: '2026-12-31' }]
          : [
            { ...base, id: `${c.id}-1`, what: 'ЄП за ноябрь', due: '2026-11-20', periodicity: 'month', periodEnd: '2026-11-30' },
            { ...base, id: `${c.id}-2`, what: 'ЄСВ за IV квартал', due: '2027-01-20', periodicity: 'quarter', periodEnd: '2026-12-31' },
            { ...base, id: `${c.id}-3`, what: 'Декларація платника ЄП, 2026 рік', due: '2027-03-01', periodicity: 'year', periodEnd: '2026-12-31' },
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
      case 'decideInbox': {
        // Как будет на сервере (inbox.decide): принять платёж — запись в «💰 Платежи»; задача — в «🧩 Задачи».
        const it = this.inbox.get(op.id);
        if (!it) return { ok: false, code: 'NOT_FOUND', message: 'Этого сообщения уже нет' };
        if (it.status !== 'new') return { ok: false, code: 'VALIDATION', message: 'Уже решено — в Telegram или на сайте', current: { ...it } };
        const changes: Change[] = [];
        let status: InboxItem['status'] = 'rejected';
        if (op.action === 'accept') {
          status = 'accepted';
          if (it.type === 'payment') {
            const kopecks = op.amount ?? it.amount ?? null;
            if (!kopecks || !it.clientId) return { ok: false, code: 'VALIDATION', message: 'Нужны сумма и клиент' };
            const p: Payment = { id: `${o}`, version: this.cursor + 1, clientId: it.clientId, kopecks, period: 'Октябрь 2026', method: 'bank', date: TODAY, source: 'сайт' };
            this.payments.set(p.id, p);
            changes.push(this.record('payment', 'upsert', p.id, o, p));
          }
        } else if (op.action === 'task') {
          status = 'task';
          const t: Task = { id: `${o}`, version: this.cursor + 1, clientId: it.clientId, text: it.snippet.slice(0, 80), due: null, type: 'docs', priority: 'medium', done: false };
          this.tasks.set(t.id, t);
          changes.push(this.record('task', 'upsert', t.id, o, t));
        }
        const upd: InboxItem = { ...it, status, version: this.cursor + 1 };
        this.inbox.set(it.id, upd);
        changes.push(this.record('inbox', 'upsert', it.id, o, upd));
        return { ok: true, changes, cursor: this.cursor };
      }
      case 'answerQuestion': {
        // Как сервер (контракт v2.1, у. 6): уже отвечен в Telegram — отказ с текущим ответом; choice — только из вариантов.
        const q = this.questions.get(op.id);
        if (!q) return { ok: false, code: 'NOT_FOUND', message: 'Этого вопроса уже нет' };
        if (q.answer !== null) return { ok: false, code: 'VALIDATION', message: `Уже ответили в Telegram: ${q.answer}`, current: { ...q } };
        if (q.type === 'choice' && !q.options.includes(op.text)) return { ok: false, code: 'VALIDATION', message: 'Выберите один из вариантов' };
        if (q.type === 'number' && !/^-?\d+([.,]\d+)?$/.test(op.text.trim())) return { ok: false, code: 'VALIDATION', message: 'Здесь нужно число' };
        const upd: Question = { ...q, answer: op.text, version: this.cursor + 1 };
        this.questions.set(q.id, upd);
        return { ok: true, changes: [this.record('question', 'upsert', q.id, o, upd), this.act(`Ответ на вопрос: ${op.text}`, o, 'сайт')], cursor: this.cursor };
      }
      case 'completeTask': {
        const t = this.tasks.get(op.id);
        if (!t) return { ok: false, code: 'NOT_FOUND', message: 'Этой задачи уже нет' };
        const upd = { ...t, done: op.done, version: this.cursor + 1 };
        this.tasks.set(t.id, upd);
        return { ok: true, changes: [this.record('task', 'upsert', t.id, o, upd)], cursor: this.cursor };
      }
      case 'updateDeadline': {
        const d = this.deadlines.get(op.id);
        if (!d) return { ok: false, code: 'NOT_FOUND', message: 'Этого срока уже нет' };
        if (d.version !== op.baseVersion) return { ok: false, code: 'CONFLICT', message: 'Срок изменился в таблице', current: { ...d } };
        const { note: _note, ...patch } = op.patch;
        void _note;
        const upd: Deadline = { ...d, ...patch, version: this.cursor + 1 };
        this.deadlines.set(d.id, upd);
        const name = this.clients.get(d.clientId)?.name ?? '';
        return { ok: true, changes: [this.record('deadline', 'upsert', d.id, o, upd), this.act(`Изменён срок «${d.what}» — ${short(name)}`, o, 'сайт')], cursor: this.cursor };
      }
      case 'updateClient': {
        const c = this.clients.get(op.id);
        if (!c) return { ok: false, code: 'NOT_FOUND', message: 'Клиента нет в таблице' };
        if (c.version !== op.baseVersion) return { ok: false, code: 'CONFLICT', message: 'Карточка изменилась в таблице', current: { ...c } };
        const upd = { ...c, ...op.patch, version: this.cursor + 1 };
        this.clients.set(c.id, upd);
        return { ok: true, changes: [this.record('client', 'upsert', c.id, o, upd), this.act(`Изменена карточка: ${short(c.name)}`, o, 'сайт')], cursor: this.cursor };
      }
    }
  }

  async listPayments(month: string): Promise<{ payments: Payment[]; totalKopecks: number }> {
    await wait(READ_MS);
    if (!this.online) throw new Error('NETWORK');
    const payments = [...this.payments.values()].filter((p) => p.date?.startsWith(month)).map((p) => ({ ...p }));
    const totalKopecks = payments.filter((p) => !p.status || p.status === 'received').reduce((s, p) => s + (p.kopecks ?? 0), 0);
    return { payments, totalKopecks };
  }

  async listQuestions(): Promise<Question[]> {
    await wait(READ_MS);
    if (!this.online) throw new Error('NETWORK');
    return [...this.questions.values()].filter((q) => q.answer === null).map((q) => ({ ...q, options: [...q.options] }));
  }

  async clientCard(id: string): Promise<ClientCard> {
    await wait(READ_MS);
    if (!this.online) throw new Error('NETWORK');
    const c = this.clients.get(id);
    if (!c) throw new Error('NOT_FOUND');
    const surname = c.name.split(' ')[0] ?? '#';
    return {
      client: { ...c },
      deadlines: [...this.deadlines.values()].filter((d) => d.clientId === id).map((d) => ({ ...d })),
      payments: [...this.payments.values()].filter((p) => p.clientId === id).map((p) => ({ ...p })),
      tasks: [...this.tasks.values()].filter((t) => t.clientId === id).map((t) => ({ ...t })),
      // На сервере история — строки журнала с clientId; здесь — по фамилии в ленте выдуманных событий.
      history: this.activity.filter((a) => a.text.includes(surname)).map((a) => ({ ...a })),
    };
  }

  async referenceRates(year?: number): Promise<Rates> {
    await wait(READ_MS);
    if (!this.online) throw new Error('NETWORK');
    return { ...RATES, year: year ?? RATES.year, groups: RATES.groups.map((g) => ({ ...g })) };
  }

  async referenceKved(q: string): Promise<KvedFound> {
    await wait(READ_MS);
    if (!this.online) throw new Error('NETWORK');
    const t = q.trim();
    const items: KvedItem[] = KVEDS.filter((k) => k.code.startsWith(t) || fold(`${k.title} ${k.words}`).includes(fold(t))).slice(0, 20)
      .map(({ code, title, epByGroup, councilDecision }) => ({ code, title, epByGroup: { ...epByGroup }, councilDecision }));
    return { items, note: items.length ? null : 'Ставка для этого КВЕДа не установлена радою' };
  }

  // ── Правки «извне» для режима отладки: так выглядят изменения в таблице и через бота ──
  external(kind: 'payment' | 'key' | 'close' | 'phone' | 'inbox'): string {
    if (kind === 'inbox') {
      const it: InboxItem = { id: `in-${this.cursor + 1}`, at: `${TODAY}T${new Date().toTimeString().slice(0, 5)}`, clientId: 'c2', clientName: 'Вербицький Андрій', type: 'payment', snippet: 'Сплатив 4 200 грн за III квартал', amount: 420000, status: 'new', version: this.cursor + 1 };
      this.inbox.set(it.id, it);
      this.record('inbox', 'upsert', it.id, 'таблица', it);
      return 'Telegram: Вербицький Андрій — «Сплатив 4 200 грн»';
    }
    if (kind === 'payment') {
      const p: Payment = { id: `p-bot-${this.cursor + 1}`, version: this.cursor + 1, clientId: 'c5', kopecks: 320000, period: 'III квартал 2026', method: 'bank', date: TODAY, source: 'бот' };
      this.payments.set(p.id, p);
      this.record('payment', 'upsert', p.id, 'таблица', p);
      this.act('Платёж 3 200,00 ₴ от Ясенко Миколы записан', 'таблица', 'бот');
      return 'Через бота: платёж 3 200,00 ₴ от Ясенко Миколы';
    }
    if (kind === 'key' || kind === 'phone') {
      const c = this.clients.get('c1');
      if (!c) return '';
      const upd = kind === 'key' ? { ...c, keyUntil: '2027-10-19', version: this.cursor + 1 } : { ...c, phone: '+380 00 000 99 99', version: this.cursor + 1 };
      this.clients.set(c.id, upd);
      this.record('client', 'upsert', c.id, 'таблица', upd);
      this.act(kind === 'key' ? 'Ключ ЭЦП Ромашко Олены продлён до 19.10.2027' : 'Телефон Ромашко Олены изменён в таблице', 'таблица', 'таблица');
      return kind === 'key' ? 'Из таблицы: ключ ЭЦП Ромашко Олены продлён до 19.10.2027' : 'Из таблицы: изменён телефон Ромашко Олены';
    }
    const d = [...this.deadlines.values()].filter((x) => x.status !== 'done' && (!x.periodEnd || x.periodEnd < TODAY)).sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''))[0];
    if (!d) return 'Нет сроков, которые можно закрыть';
    const done: Deadline = { ...d, status: 'done', closedAt: TODAY, version: this.cursor + 1 };
    this.deadlines.set(d.id, done);
    this.record('deadline', 'upsert', d.id, 'таблица', done);
    const name = this.clients.get(d.clientId)?.name ?? '';
    this.act(`Закрыт срок «${d.what}» — ${short(name)}`, 'таблица', 'бот');
    return `Через бота: закрыт срок «${d.what}» — ${short(name)}`;
  }
}

export const fakeServer = new FakeServer();
