// Очередь записей «ещё не в таблице». Хранится в IndexedDB — переживает обрыв связи и перезагрузку страницы.
// Отправляет строго по одной и по порядку (отмена не обгонит закрытие). Нет связи — ждёт и повторяет с паузой
// 2 → 4 → 8 → … 30 с. Повтор безопасен: у каждой записи свой requestId, сервер не создаёт дубль.
// Счётчики ступеней (правило владельца, п. 2.8): введено → в очереди → отправлено → принято → применено → видно в таблице.
import type { CabinetApi, WriteOp, WriteResult } from './api';

export type ItemState = 'queued' | 'sending' | 'failed' | 'conflict';

export interface OutboxItem {
  op: WriteOp;
  label: string;
  createdAt: number;
  attempts: number;
  state: ItemState;
  error?: string;
}

export interface Storage {
  set: (key: string, value: OutboxItem) => Promise<void>;
  del: (key: string) => Promise<void>;
  all: () => Promise<OutboxItem[]>;
}

export type OutboxEvent =
  | { type: 'applied'; item: OutboxItem; result: Extract<WriteResult, { ok: true }> }
  | { type: 'failed'; item: OutboxItem; result: Extract<WriteResult, { ok: false }> }
  | { type: 'conflict'; item: OutboxItem; result: Extract<WriteResult, { ok: false }> }
  | { type: 'offline'; item: OutboxItem }
  | { type: 'changed' };

export interface Counters {
  entered: number;
  sent: number;
  accepted: number;
  rejected: number;
  applied: number;
  seenInTable: number;
}

const BACKOFF_MS = [2000, 4000, 8000, 16000, 30000];

export class Outbox {
  private items = new Map<string, OutboxItem>();
  private busy = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  counters: Counters = { entered: 0, sent: 0, accepted: 0, rejected: 0, applied: 0, seenInTable: 0 };

  constructor(private api: CabinetApi, private storage: Storage, private emit: (e: OutboxEvent) => void) {}

  /** Подхватить то, что осталось в очереди с прошлого раза (после перезагрузки или обрыва). */
  async load(): Promise<OutboxItem[]> {
    const saved = await this.storage.all();
    for (const it of saved.sort((a, b) => a.createdAt - b.createdAt)) {
      this.items.set(it.op.requestId, { ...it, state: it.state === 'sending' ? 'queued' : it.state });
    }
    this.emit({ type: 'changed' });
    void this.kick();
    return [...this.items.values()];
  }

  list(): OutboxItem[] {
    return [...this.items.values()].sort((a, b) => a.createdAt - b.createdAt);
  }

  has(requestId: string): boolean {
    return this.items.has(requestId);
  }

  async enqueue(op: WriteOp, label: string): Promise<void> {
    const item: OutboxItem = { op, label, createdAt: Date.now(), attempts: 0, state: 'queued' };
    this.items.set(op.requestId, item);
    this.counters.entered++;
    await this.storage.set(op.requestId, item);
    this.emit({ type: 'changed' });
    void this.kick();
  }

  async retry(requestId: string): Promise<void> {
    const it = this.items.get(requestId);
    if (!it) return;
    it.state = 'queued';
    delete it.error;
    await this.storage.set(requestId, it);
    this.emit({ type: 'changed' });
    void this.kick(true);
  }

  async discard(requestId: string): Promise<void> {
    this.items.delete(requestId);
    await this.storage.del(requestId);
    this.emit({ type: 'changed' });
  }

  /** Отправить следующую запись. now=true — не ждать паузы (кнопка «Повторить», связь вернулась). */
  async kick(now = false): Promise<void> {
    if (now && this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.busy || this.timer) return;
    const next = this.list().find((i) => i.state === 'queued');
    if (!next) return;
    this.busy = true;
    next.state = 'sending';
    next.attempts++;
    this.counters.sent++;
    this.emit({ type: 'changed' });
    let result: WriteResult;
    try {
      result = await this.api.write(next.op);
    } catch {
      result = { ok: false, code: 'NETWORK', message: 'Нет связи с таблицей' };
    }
    this.busy = false;
    if (result.ok) {
      this.counters.accepted++;
      this.items.delete(next.op.requestId);
      await this.storage.del(next.op.requestId);
      this.emit({ type: 'applied', item: next, result });
      this.counters.applied++;
      this.emit({ type: 'changed' });
      void this.kick();
      return;
    }
    if (result.code === 'NETWORK') {
      next.state = 'queued';
      next.error = result.message;
      await this.storage.set(next.op.requestId, next);
      this.emit({ type: 'offline', item: next });
      this.emit({ type: 'changed' });
      const pause = BACKOFF_MS[Math.min(next.attempts - 1, BACKOFF_MS.length - 1)] ?? 30000;
      this.timer = setTimeout(() => { this.timer = null; void this.kick(); }, pause);
      return;
    }
    this.counters.rejected++;
    next.state = result.code === 'CONFLICT' ? 'conflict' : 'failed';
    next.error = result.message;
    await this.storage.set(next.op.requestId, next);
    this.emit({ type: result.code === 'CONFLICT' ? 'conflict' : 'failed', item: next, result });
    this.emit({ type: 'changed' });
    // Отказ по одной записи не держит остальные — отправляем следующие.
    void this.kick();
  }

  private seen = new Set<string>();

  /** Запись с этого сайта пришла обратно в журнале изменений таблицы — «видно в таблице» (по одной на запись). */
  markSeen(requestId: string): void {
    if (this.seen.has(requestId)) return;
    this.seen.add(requestId);
    this.counters.seenInTable++;
  }
}
