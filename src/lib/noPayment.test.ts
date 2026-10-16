import { describe, expect, it } from 'vitest';
import { lastPaid, noPaymentFor } from './noPayment';
import type { Payment } from '../data/types';

const p = (id: string, clientId: string, date: string | null, extra: Partial<Payment> = {}): Payment =>
  ({ id, version: 1, clientId, kopecks: 100000, period: 'x', method: 'bank', date, source: 'таблица', ...extra });

describe('без платежа N дней', () => {
  const pays = [
    p('1', 'A', '2026-10-10'), p('2', 'A', '2026-07-01'),
    p('3', 'B', '2026-08-01'), p('4', 'B', '2026-10-12', { status: 'expected' }), // ожидается — не платёж
    p('5', 'C', null), p('6', 'D', '2026-10-15', { save: 'failed' }),
  ];
  const last = lastPaid(pays);
  it('последний полученный платёж; без даты, «ожидается» и не записанный — не в счёт', () => {
    expect([...last.entries()].sort()).toEqual([['A', '2026-10-10'], ['B', '2026-08-01']]);
  });
  it('больше N дней или платежа нет вовсе', () => {
    const t = '2026-10-16';
    expect(['A', 'B', 'C', 'D'].map((c) => noPaymentFor(last, c, 60, t))).toEqual([false, true, true, true]);
    expect(noPaymentFor(last, 'B', 90, t)).toBe(false); // 76 дней
    expect(noPaymentFor(last, 'A', 6, t)).toBe(false); // ровно 6 дней — ещё не «больше 6»
  });
});
