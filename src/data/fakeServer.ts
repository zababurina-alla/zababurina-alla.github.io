// Выдуманный сервер-таблица для прототипа: ведёт себя как будущий API в Apps Script.
// — запись подтверждается с задержкой; — автоцикл создаёт следующий период; — проверка «период закончился»;
// — версии записей и ошибка CONFLICT; — журнал изменений с курсором; — повтор того же requestId не создаёт дубль.
// Рычаги отладки (обрыв связи, отказ, правка извне) — для кнопок в режиме отладки.
import { ACTIVITY, CLIENTS, CONSULTATIONS, DEADLINES, INBOX, KVEDS, PAYMENTS, QUESTIONS, RATES, TASKS } from './fake';
import type { AiAnswer, ApplyTemplateResult, ClientPhotos, ArchivePage, AttentionItem, MonthCheck, MonthItem, MonthSheet, BotLinkResult, CabinetApi, StatementPdf, StatementPreview, StatementResult, CancelNotifyResult, Change, CreateDeadlineResult, DeadlineTemplate, NewDeadline, TemplatePreview, ClientCard, Entity, KvedAll, KvedFound, RemindPreview, RemindRequest, RemindResult, Snapshot, WriteOp, WriteResult } from './api';
import type { Activity, Client, Consultation, Deadline, InboxItem, KvedItem, Payment, Question, Rates, Task } from './types';
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
  /** Скрытые на сайте сообщения «Входящих»: id → когда скрыто (вернуть можно 24 ч). */
  private hidden = new Map<string, number>();
  private consultations = new Map<string, Consultation>(CONSULTATIONS.map((k) => [k.id, { ...k }]));
  private questions = new Map<string, Question>(QUESTIONS.map((q) => [q.id, { ...q, options: [...q.options] }]));
  private log: Change[] = [];
  private cursor = 100;
  /** Ответы на уже выполненные requestId — повтор из очереди возвращает тот же ответ (идемпотентность). */
  private done = new Map<string, WriteResult>();
  /** Что закрыл requestId — для отмены (удалить созданный автоциклом период, вернуть закрытый). */
  private closedBy = new Map<string, { closed: Deadline; next: Deadline | null }>();
  /** Срок → когда уйдёт сообщение клиенту о закрытии (через 2 мин, п. 31). */
  private notifyAt = new Map<string, number>();

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
      inbox: [...this.inbox.values()].filter((i) => !this.hidden.has(i.id)).map((i) => ({ ...i })),
      consultations: [...this.consultations.values()].map((k) => ({ ...k })),
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
        this.notifyAt.set(d.id, Date.now() + 120_000);
        const notifyAt = new Date(Date.now() + 120_000).toISOString();
        return { ok: true, changes, cursor: this.cursor, notifyAt };
      }
      case 'closeDeadlines': {
        // Как deadlines.closeMany: каждый срок — как отдельное закрытие; отказ по одному не мешает остальным.
        const changes: Change[] = [];
        const failed: NonNullable<Extract<WriteResult, { ok: true }>['failed']> = [];
        const nextOf: Record<string, string | null> = {};
        for (const it of op.items) {
          const r = this.apply({ kind: 'closeDeadline', requestId: `${o}#${it.id}`, id: it.id, baseVersion: it.baseVersion });
          if (r.ok) {
            changes.push(...r.changes);
            nextOf[it.id] = r.changes.find((c) => c.entity === 'deadline' && c.id !== it.id && c.op === 'upsert')?.id ?? null;
          }
          else failed.push({ id: it.id, code: r.code, message: r.message, ...(r.current && 'periodicity' in r.current ? { current: r.current } : {}) });
        }
        return { ok: true, changes, cursor: this.cursor, failed, nextOf };
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
      case 'updatePayment': {
        // Как payments.update: пишет только в пустую ячейку; заполненное поле — VALIDATION; дата не позже завтра; сумма > 0.
        const cur = this.payments.get(op.id);
        if (!cur) return { ok: false, code: 'NOT_FOUND', message: 'Этого платежа уже нет' };
        if (cur.version !== op.baseVersion) return { ok: false, code: 'CONFLICT', message: 'Платёж изменили в таблице', current: { ...cur } };
        const { date, amountKopecks } = op.patch;
        if (date !== undefined && cur.date !== null) return { ok: false, code: 'VALIDATION', message: 'Дата уже есть в таблице — исправьте её там' };
        if (amountKopecks !== undefined && cur.kopecks !== null) return { ok: false, code: 'VALIDATION', message: 'Сумма уже есть в таблице — исправьте её там' };
        if (date !== undefined && date > addDays(TODAY, 1)) return { ok: false, code: 'VALIDATION', message: 'Дата оплаты ещё не наступила' };
        if (amountKopecks !== undefined && !(Number.isInteger(amountKopecks) && amountKopecks > 0)) return { ok: false, code: 'VALIDATION', message: 'Сумма должна быть больше нуля' };
        const upd: Payment = { ...cur, ...(date !== undefined ? { date } : {}), ...(amountKopecks !== undefined ? { kopecks: amountKopecks } : {}), version: this.cursor + 1 };
        this.payments.set(cur.id, upd);
        return { ok: true, changes: [this.record('payment', 'upsert', cur.id, o, upd), this.act('Платёж дополнен', o, 'сайт')], cursor: this.cursor };
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
      case 'updateDeadlines': {
        const changes: Change[] = [];
        const failed: NonNullable<Extract<WriteResult, { ok: true }>['failed']> = [];
        for (const it of op.items) {
          const r = this.apply({ kind: 'updateDeadline', requestId: `${o}#${it.id}`, id: it.id, baseVersion: it.baseVersion, patch: op.patch });
          if (r.ok) changes.push(...r.changes);
          else failed.push({ id: it.id, code: r.code, message: r.message, ...(r.current && 'periodicity' in r.current ? { current: r.current } : {}) });
        }
        return { ok: true, changes, cursor: this.cursor, failed };
      }
      case 'completeTasks': {
        const changes: Change[] = [];
        const failed: NonNullable<Extract<WriteResult, { ok: true }>['failed']> = [];
        for (const id of op.ids) {
          const t = this.tasks.get(id);
          if (!t) { failed.push({ id, code: 'NOT_FOUND', message: 'Задачи уже нет' }); continue; }
          const upd = { ...t, done: op.done, version: t.version + 1 };
          this.tasks.set(id, upd);
          changes.push(this.record('task', 'upsert', id, o, upd));
        }
        return { ok: true, changes, cursor: this.cursor, failed };
      }
      case 'createTask': {
        const t = { ...op.task, version: 1 };
        this.tasks.set(t.id, t);
        return { ok: true, changes: [this.record('task', 'upsert', t.id, o, t)], cursor: this.cursor };
      }
      case 'createConsultation': {
        // Как consultations.create (v5.87): тема 1–300, минуты — целое 1–1440, заметка до 1000; id = requestId.
        const k = op.consultation;
        if (!this.clients.has(k.clientId)) return { ok: false, code: 'VALIDATION', message: 'Клиента нет в таблице' };
        if (!k.topic.trim() || k.topic.length > 300) return { ok: false, code: 'VALIDATION', message: 'Тема — от 1 до 300 знаков' };
        if (k.minutes !== null && (!Number.isInteger(k.minutes) || k.minutes < 1 || k.minutes > 1440)) return { ok: false, code: 'VALIDATION', message: 'Минуты — целое число от 1 до 1440' };
        const rec: Consultation = { ...k, id: o, version: 1, at: now() };
        this.consultations.set(rec.id, rec);
        return { ok: true, changes: [this.record('consultation', 'upsert', rec.id, o, rec)], cursor: this.cursor };
      }
      case 'hideInbox': {
        const changes: Change[] = [];
        for (const id of op.ids) {
          if (!this.inbox.has(id)) continue;
          if (!this.hidden.has(id)) this.hidden.set(id, Date.now());
          changes.push(this.record('inbox', 'delete', id, o));
        }
        return { ok: true, changes, cursor: this.cursor, failed: [] };
      }
      case 'unhideInbox': {
        const changes: Change[] = [];
        const failed: NonNullable<Extract<WriteResult, { ok: true }>['failed']> = [];
        for (const id of op.ids) {
          const at = this.hidden.get(id);
          const it = this.inbox.get(id);
          if (at === undefined || !it || Date.now() - at > 24 * 3600_000) { failed.push({ id, code: 'VALIDATION', message: 'Вернуть можно в течение суток' }); continue; }
          this.hidden.delete(id);
          changes.push(this.record('inbox', 'upsert', id, o, { ...it }));
        }
        return { ok: true, changes, cursor: this.cursor, failed };
      }
      case 'decideInbox': {
        // Как будет на сервере (inbox.decide): принять платёж — запись в «💰 Платежи»; задача — в «🧩 Задачи».
        const it = this.inbox.get(op.id);
        if (!it) return { ok: false, code: 'NOT_FOUND', message: 'Этого сообщения уже нет' };
        if (it.status !== 'new') return { ok: false, code: 'CONFLICT', message: 'Уже решено — в Telegram или на сайте', current: { ...it } };
        if (op.action === 'taxTask') {
          // Задача по налогу смешанного сообщения — статус сообщения не меняется (v5.72).
          const t: Task = { id: `${o}`, version: this.cursor + 1, clientId: it.clientId, text: `Налог: ${formatPayMoney(it.taxKopecks ?? null)} — ${it.clientName}`, due: null, type: 'taxes', priority: 'high', done: false };
          this.tasks.set(t.id, t);
          return { ok: true, changes: [this.record('task', 'upsert', t.id, o, t)], cursor: this.cursor };
        }
        if (op.action === 'accept' && op.amount !== undefined && op.amount < 5000) return { ok: false, code: 'VALIDATION', message: 'Сумма меньше 50 ₴ — проверьте' };
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
          } else {
            const text = it.type === 'order' ? `Оплатить за ${it.clientName}${it.amount ? ` ${formatPayMoney(it.amount)}` : ''}`
              : it.type === 'question' || it.type === 'voice' ? `Ответить ${it.clientName}` : `${it.clientName}: ${it.snippet.slice(0, 60)}`;
            const t: Task = { id: `${o}`, version: this.cursor + 1, clientId: it.clientId, text, due: null, type: it.type === 'order' || it.type === 'tax' ? 'taxes' : 'call', priority: 'medium', done: false };
            this.tasks.set(t.id, t);
            changes.push(this.record('task', 'upsert', t.id, o, t));
          }
        } else if (op.action === 'task') {
          status = 'task';
          const t: Task = { id: `${o}`, version: this.cursor + 1, clientId: it.clientId, text: it.snippet.slice(0, 80), due: null, type: 'docs', priority: 'medium', done: false };
          this.tasks.set(t.id, t);
          changes.push(this.record('task', 'upsert', t.id, o, t));
        }
        const upd: InboxItem = { ...it, status, version: this.cursor + 1, decidedAt: now() };
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
      case 'updateTask': {
        const t = this.tasks.get(op.id);
        if (!t) return { ok: false, code: 'NOT_FOUND', message: 'Этой задачи уже нет' };
        if (t.version !== op.baseVersion) return { ok: false, code: 'CONFLICT', message: 'Задача изменилась в таблице', current: { ...t } };
        if (t.done) return { ok: false, code: 'VALIDATION', message: 'Сделанную задачу править нельзя — сначала верните её в работу' };
        const upd: Task = { ...t, ...op.patch, version: this.cursor + 1 };
        this.tasks.set(t.id, upd);
        return { ok: true, changes: [this.record('task', 'upsert', t.id, o, upd)], cursor: this.cursor };
      }
      case 'deleteTask': {
        const t = this.tasks.get(op.id);
        if (!t) return { ok: false, code: 'NOT_FOUND', message: 'Этой задачи уже нет' };
        if (t.version !== op.baseVersion) return { ok: false, code: 'CONFLICT', message: 'Задача изменилась в таблице', current: { ...t } };
        this.tasks.delete(t.id);
        return { ok: true, changes: [this.record('task', 'delete', t.id, o)], cursor: this.cursor };
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
        // КВЕД — коды; названия из справочника; главный — как сервер: по наибольшей ставке (здесь — первый с названием из
        // справочника, где выше группа ЄП; упрощённо — первый код списка).
        const { kved, income, ...rest } = op.patch;
        if (income && !(Number.isInteger(income.amountKopecks) && income.amountKopecks >= 0)) return { ok: false, code: 'VALIDATION', message: 'Доход — целое число копеек, не меньше нуля' };
        const kvedList = kved?.map((code) => ({ code, title: c.kved.find((k) => k.code === code)?.title ?? KVEDS.find((k) => k.code === code)?.title ?? '' }));
        const upd: Client = { ...c, ...rest, ...(income ? { incomeKopecks: income.amountKopecks, incomeBasis: income.basis } : {}), ...(kvedList ? { kved: kvedList, kvedMain: kvedList[0]?.code ?? null, kvedMainNote: kvedList.length > 1 ? 'max ставка' : null } : {}), version: this.cursor + 1 };
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

  async remindPreview(req: Omit<RemindRequest, 'text'>): Promise<RemindPreview> {
    await wait(READ_MS);
    const c = this.clients.get(req.clientId);
    if (c?.botConnected === false) return { preview: null, lang: 'uk', reason: 'noBot', message: 'У клиента нет бота в Telegram — позвоните или напишите сами' };
    const d = req.deadlineId ? this.deadlines.get(req.deadlineId) : undefined;
    const hi = `Добрий день${c ? `, ${c.name.split(' ')[1] ?? ''}` : ''}!`;
    return { preview: d ? `${hi} 📅 Нагадую: ${d.what} — до ${fmtDate(d.due ?? TODAY)}.` : `${hi} 🔐 Ключ ЕЦП діє до ${fmtDate(c?.keyUntil ?? TODAY)} — час продовжити.`, lang: 'uk', reason: null, message: null };
  }

  private created = new Map<string, CreateDeadlineResult>();
  /** Как deadlines.create v5.88: обязательство 1–300, дата YYYY-MM-DD; тот же открытый срок у клиента — CONFLICT с ним
   *  (регистр, ё и пробелы не важны); periodEnd — как у сроков таблицы (здесь — конец прошлого месяца/квартала/года). */
  async createDeadline(d: NewDeadline, requestId: string): Promise<CreateDeadlineResult> {
    await wait(READ_MS * 2);
    if (!this.online) throw new Error('NETWORK');
    const again = this.created.get(requestId);
    if (again) return again;
    const norm = (s: string) => fold(s).replace(/\s+/g, ' ');
    const fail = (code: 'VALIDATION' | 'CONFLICT', field: string, message: string, current: Deadline | null = null): CreateDeadlineResult =>
      ({ ok: false, code, message, field, current });
    if (!this.clients.has(d.clientId)) return fail('VALIDATION', 'clientId', 'Клиента нет в таблице');
    if (!d.obligation.trim() || d.obligation.length > 300) return fail('VALIDATION', 'obligation', 'Что сдать — от 1 до 300 знаков');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.due)) return fail('VALIDATION', 'due', 'Дата — в виде ГГГГ-ММ-ДД');
    const same = [...this.deadlines.values()].find((x) => x.clientId === d.clientId && x.status !== 'done' && norm(x.what) === norm(d.obligation));
    if (same) return fail('CONFLICT', 'obligation', 'У клиента уже есть открытый срок с этим обязательством', { ...same });
    const pe = d.periodicity === 'once' ? null : endOfMonth(addDays(`${d.due.slice(0, 7)}-01`, -1));
    const rec: Deadline = { id: requestId, version: 1, clientId: d.clientId, what: d.obligation.trim(), periodicity: d.periodicity, due: d.due, periodEnd: pe, status: 'new', closedAt: null };
    this.deadlines.set(rec.id, rec);
    this.record('deadline', 'upsert', rec.id, requestId, rec);
    this.act(`Новый срок: ${rec.what} — ${short(this.clients.get(d.clientId)?.name ?? '')}`, requestId, 'сайт');
    const res: CreateDeadlineResult = { ok: true, deadline: { ...rec } };
    this.created.set(requestId, res);
    return res;
  }

  /** Шаблон по типу клиента и его обязательства (упрощённо — как сервер: добавляет только то, чего у клиента нет). */
  private templateOf(c: Client, template?: DeadlineTemplate): DeadlineTemplate | null {
    if (template) return template;
    const byKind: Partial<Record<NonNullable<Client['kind']>, DeadlineTemplate>> = { fop1: 'FOP1', fop2: 'FOP2', fop3: 'FOP3', fopGeneral: 'FOP_GENERAL', tov3: 'TOV_SIMPLE', tovGeneral: 'TOV_GENERAL', person: 'INDIVIDUAL', nonresident: 'NONRESIDENT' };
    return c.kind ? byKind[c.kind] ?? null : null;
  }
  private plan(c: Client, t: DeadlineTemplate) {
    const all: { obligation: string; periodicity: Deadline['periodicity']; due: string }[] = t === 'FOP3' || t === 'TOV_SIMPLE'
      ? [{ obligation: 'Декларація платника ЄП, IV квартал', periodicity: 'quarter', due: '2027-02-09' }, { obligation: 'ЄП за IV квартал', periodicity: 'quarter', due: '2027-02-19' }, { obligation: 'ЄСВ за IV квартал', periodicity: 'quarter', due: '2027-01-20' }]
      : t === 'FOP1' || t === 'FOP2'
        ? [{ obligation: 'ЄП за листопад', periodicity: 'month', due: '2026-11-20' }, { obligation: 'ЄСВ за IV квартал', periodicity: 'quarter', due: '2027-01-20' }, { obligation: 'Декларація платника ЄП за 2026 рік', periodicity: 'year', due: '2027-03-01' }]
        : [{ obligation: 'Податковий розрахунок, IV квартал', periodicity: 'quarter', due: '2027-02-09' }, { obligation: 'ЄСВ за IV квартал', periodicity: 'quarter', due: '2027-01-20' }];
    const have = new Set([...this.deadlines.values()].filter((d) => d.clientId === c.id && d.status !== 'done').map((d) => fold(d.what)));
    return { wouldAdd: all.filter((x) => !have.has(fold(x.obligation))), skipped: all.filter((x) => have.has(fold(x.obligation))).map((x) => x.obligation) };
  }
  async previewTemplate(clientId: string, template?: DeadlineTemplate): Promise<TemplatePreview | { ok: false; code: 'VALIDATION'; message: string; field: string }> {
    await wait(READ_MS);
    if (!this.online) throw new Error('NETWORK');
    const c = this.clients.get(clientId);
    if (!c) return { ok: false, code: 'VALIDATION', message: 'Клиента нет в таблице', field: 'clientId' };
    const t = this.templateOf(c, template);
    if (!t) return { ok: false, code: 'VALIDATION', message: 'У клиента не указана система — выберите шаблон', field: 'template' };
    return { template: t, ...this.plan(c, t) };
  }
  private applied = new Map<string, ApplyTemplateResult>();
  async applyTemplate(clientId: string, template: DeadlineTemplate | undefined, requestId: string): Promise<ApplyTemplateResult> {
    await wait(READ_MS * 2);
    if (!this.online) throw new Error('NETWORK');
    const again = this.applied.get(requestId);
    if (again) return again;
    const c = this.clients.get(clientId);
    if (!c) return { ok: false, code: 'VALIDATION', message: 'Клиента нет в таблице', field: 'clientId' };
    const t = this.templateOf(c, template);
    if (!t) return { ok: false, code: 'VALIDATION', message: 'У клиента не указана система — выберите шаблон', field: 'template' };
    const { wouldAdd, skipped } = this.plan(c, t);
    const added = wouldAdd.map((x): Deadline => {
      const id = `D-${++this.cursor}`;
      const d: Deadline = { id, version: 1, clientId, what: x.obligation, periodicity: x.periodicity, due: x.due, periodEnd: null, status: 'new', closedAt: null };
      this.deadlines.set(id, d);
      this.log.push({ cursor: this.cursor, entity: 'deadline', op: 'upsert', id, origin: requestId, record: d });
      return { ...d };
    });
    if (added.length) this.act(`Шаблон ${t}: добавлено сроков ${added.length} — ${short(c.name)}`, requestId, 'сайт');
    const res: ApplyTemplateResult = { ok: true, template: t, added, skipped };
    this.applied.set(requestId, res);
    return res;
  }

  /** Учебный помощник: ответ через 3–10 с. Слова «лимит» и «выключ» в вопросе — показать эти состояния. */
  aiDelayMs = (): number => 3000 + Math.random() * 7000;
  async aiAsk(q: string, clientId: string | null): Promise<AiAnswer> {
    await wait(this.aiDelayMs());
    if (!this.online) return { ok: false, reason: 'error', message: 'Нет связи — спросите ещё раз' };
    const t = q.toLowerCase();
    if (t.includes('лимит')) return { ok: false, reason: 'limit', message: 'Лимит вопросов на сегодня исчерпан — завтра снова можно' };
    if (t.includes('выключ')) return { ok: false, reason: 'off', message: 'Помощник на сайте пока выключен' };
    const c = clientId ? this.clients.get(clientId) : undefined;
    const open = c ? [...this.deadlines.values()].filter((d) => d.clientId === c.id && d.status !== 'done') : [];
    const about = c ? `По клиенту ${short(c.name)}: открытых сроков ${open.length}${open[0] ? `, ближайший — «${open[0].what}» до ${fmtDate(open[0].due ?? TODAY)}` : ''}.\n` : '';
    if (t.includes('отказ')) return { ok: true, kind: 'refusal', answer: 'Об этом я не подскажу — спросите Дмитрия.', sources: [] };
    return { ok: true, kind: 'reply', answer: `${about}Это учебный ответ помощника на вопрос «${q.trim()}». Настоящий помощник ответит по таблице и законам.`, sources: c ? ['⏰ Сроки'] : [] };
  }

  /** Учебные фото: у выдуманных клиентов фото нет — аватар остаётся буквами; etag один, второй раз — notModified. */
  async clientPhotos(etag: string | null): Promise<ClientPhotos> {
    await wait(READ_MS);
    return etag === 'demo-1' ? { etag, notModified: true, photos: {} } : { etag: 'demo-1', notModified: false, photos: {} };
  }

  async inboxHideAll(): Promise<{ hidden: number; ids: string[]; more: boolean }> {
    await wait(READ_MS * 2);
    if (!this.online) throw new Error('NETWORK');
    const ids = [...this.inbox.values()].filter((i) => i.status !== 'new' && !this.hidden.has(i.id)).map((i) => i.id);
    for (const id of ids) { this.hidden.set(id, Date.now()); this.record('inbox', 'delete', id, 'hideAll'); }
    return { hidden: ids.length, ids, more: false };
  }

  async clientBotLink(clientId: string): Promise<BotLinkResult> {
    await wait(READ_MS);
    if (!this.online) throw new Error('NETWORK');
    const c = this.clients.get(clientId);
    if (!c) throw new Error('NOT_FOUND');
    if (c.botConnected) return { connected: true, link: null, expiresAt: null };
    // Учебная ссылка: токен выдуманный, бот его не узнает.
    const token = Math.random().toString(36).slice(2, 12);
    return { connected: false, link: `https://t.me/za_control_bot?start=client_demo${token}`, expiresAt: `${addDays(TODAY, 7)}T23:59:00+03:00` };
  }

  async statementPdf(clientId: string): Promise<StatementPdf> {
    await wait(READ_MS * 6); // собирается несколько секунд
    if (!this.online) throw new Error('NETWORK');
    if (!this.clients.has(clientId)) throw new Error('NOT_FOUND');
    // Учебная «выписка» — пустой адрес Drive: настоящих файлов в учебном режиме нет.
    return { url: 'https://drive.google.com/', fileName: `Виписка ${short(this.clients.get(clientId)?.name ?? '')} (учебная).pdf` };
  }
  async statementPreview(clientId: string): Promise<StatementPreview> {
    await wait(READ_MS);
    const c = this.clients.get(clientId);
    if (c?.botConnected === false) return { preview: null, reason: 'noBot', message: 'У клиента нет бота в Telegram' };
    return { preview: '📜 Ваша виписка: терміни, платежі та нарахування на сьогодні.', reason: null, message: null };
  }
  async sendStatement(clientId: string, requestId: string): Promise<StatementResult> {
    const p = await this.statementPreview(clientId);
    if (!p.preview) return { sent: false, reason: 'noBot', message: p.message ?? 'У клиента нет бота' };
    return this.remindClient({ clientId, kind: 'custom', text: p.preview }, requestId);
  }

  async listArchive(clientId: string, offset = 0, limit = 50): Promise<ArchivePage> {
    await wait(READ_MS * 2);
    if (!this.online) throw new Error('NETWORK');
    // Учебный архив: прошлые кварталы и месяцы ЄП/ЄСВ — выдуманные, новые первыми.
    const all = Array.from({ length: 14 }, (_, i) => {
      const m = 9 - i; const y = m > 0 ? 2026 : 2025; const mm = ((m + 11) % 12) + 1;
      const iso = `${y}-${String(mm).padStart(2, '0')}-20`;
      return { id: i < 10 ? `A-${clientId}-${i}` : null, what: `ЄП за ${mm}.${y}`, periodicity: 'month' as const, due: iso, periodEnd: null,
        status: i === 3 ? 'archived' as const : 'done' as const, reason: i === 3 ? 'работников нет' : null, closedAt: i < 12 && i !== 3 ? iso : null, archivedAt: iso };
    });
    return { items: all.slice(offset, offset + limit), total: all.length, more: offset + limit < all.length };
  }

  async attention(limit = 10): Promise<AttentionItem[]> {
    await wait(READ_MS * 3);
    if (!this.online) throw new Error('NETWORK');
    const out: AttentionItem[] = [];
    for (const c of this.clients.values()) {
      const factors: AttentionItem['factors'] = [];
      const late = [...this.deadlines.values()].filter((d) => d.clientId === c.id && d.status !== 'done' && d.due && d.due < TODAY).length;
      if (late) factors.push({ label: `Просрочек: ${late}`, weight: 30 * late });
      if (!c.phone.trim()) factors.push({ label: 'Нет контактов', weight: 20 });
      if (!c.keyUntil) factors.push({ label: 'Ключ не указан', weight: 15 });
      else if (c.keyUntil < TODAY) factors.push({ label: 'Ключ просрочен', weight: 35 });
      else if (c.keyUntil <= addDays(TODAY, 30)) factors.push({ label: 'Ключ ≤30 дн.', weight: 20 });
      const score = Math.min(100, factors.reduce((s, f) => s + f.weight, 0));
      if (score > 0) out.push({ clientId: c.id, name: c.name, score, level: score >= 60 ? 'high' : score >= 30 ? 'mid' : 'low', factors });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  private month: MonthItem[] = [...this.clients.values()].filter((c) => c.employer).map((c, i) => {
    const checks = { advance: true, advanceTax: true, salary: i > 0, salaryTax: false, timesheet: i > 1, payroll: false, report: false };
    return { clientId: c.id, name: c.name, period: 'жовтень 2026', status: null, comment: i === 0 ? 'Чекаю табель' : null,
      percent: Math.round((Object.values(checks).filter(Boolean).length / 7) * 100), checks };
  });
  async monthGet(): Promise<MonthSheet> {
    await wait(READ_MS * 2);
    if (!this.online) throw new Error('NETWORK');
    return { period: 'жовтень 2026', items: this.month.map((m) => ({ ...m, checks: { ...m.checks } })) };
  }
  async monthSet(clientId: string, item: MonthCheck, done: boolean): Promise<MonthItem> {
    await wait(READ_MS);
    if (!this.online) throw new Error('NETWORK');
    const i = this.month.findIndex((m) => m.clientId === clientId);
    const cur = this.month[i];
    if (!cur) throw new Error('NOT_FOUND');
    const checks = { ...cur.checks, [item]: done };
    const next: MonthItem = { ...cur, checks, percent: Math.round((Object.values(checks).filter(Boolean).length / 7) * 100) };
    this.month[i] = next;
    return { ...next, checks: { ...checks } };
  }

  async cancelNotify(deadlineId: string, requestId: string): Promise<CancelNotifyResult> {
    await wait(READ_MS);
    if (!this.online) throw new Error('NETWORK');
    void requestId;
    const at = this.notifyAt.get(deadlineId);
    if (at === undefined) return { status: 'nothing' };
    if (Date.now() >= at) return { status: 'sent', sentAt: new Date(at).toISOString() };
    this.notifyAt.delete(deadlineId);
    return { status: 'cancelled' };
  }

  private reminded = new Map<string, number>();
  async remindClient(req: RemindRequest, requestId: string): Promise<RemindResult> {
    await wait(READ_MS * 4);
    if (!this.online) throw new Error('NETWORK');
    void requestId;
    const c = this.clients.get(req.clientId);
    if (!c) throw new Error('NOT_FOUND');
    // Как на сервере: у части клиентов бота нет; одно напоминание на клиента и повод за 12 ч.
    if (c.botConnected === false) return { sent: false, reason: 'noBot', message: 'У клиента нет бота в Telegram — позвоните или напишите сами' };
    const key = `${req.clientId}|${req.kind}|${req.deadlineId ?? ''}`;
    const last = this.reminded.get(key);
    if (last && Date.now() - last < 12 * 3600_000) {
      return { sent: false, reason: 'rateLimit', message: 'Этому клиенту уже напоминали об этом сегодня', retryAt: new Date(last + 12 * 3600_000).toISOString() };
    }
    this.reminded.set(key, Date.now());
    this.act(`Напоминание отправлено: ${short(c.name)}`, requestId, 'сайт');
    return { sent: true, sentAt: new Date().toISOString(), preview: req.text };
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
      consultations: [...this.consultations.values()].filter((k) => k.clientId === id).map((k) => ({ ...k })),
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

  async referenceKvedAll(): Promise<KvedAll> {
    await wait(READ_MS);
    if (!this.online) throw new Error('NETWORK');
    return { items: KVEDS.map(({ code, title, epByGroup, councilDecision }) => ({ code, title, epByGroup: { ...epByGroup }, councilDecision })), councilDecision: null, updatedAt: '2026-01-02' };
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
