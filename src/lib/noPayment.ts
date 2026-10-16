// «Без платежа N дней» на «Клиентах» (сверка функций, п. «только сайт»; в боте — find_no_payment).
// Снимок держит платежи за 90 дней — поэтому N не больше 90: старше снимок не знает.
import type { Payment } from '../data/types';
import { isReceived } from '../data/types';
import { daysBetween } from './dates';

export const NO_PAY_DAYS = [30, 60, 90] as const;
export type NoPayDays = typeof NO_PAY_DAYS[number];

/** Последний полученный платёж каждого клиента (дата); платежи без даты и «ожидается» не считаются. */
export function lastPaid(payments: readonly Payment[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of payments) {
    if (!p.date || !isReceived(p) || p.save === 'failed') continue;
    const cur = m.get(p.clientId);
    if (!cur || p.date > cur) m.set(p.clientId, p.date);
  }
  return m;
}

/** Клиент без платежа больше N дней к today (или без платежа в снимке вовсе). */
export function noPaymentFor(last: ReadonlyMap<string, string>, clientId: string, days: number, today: string): boolean {
  const d = last.get(clientId);
  return !d || daysBetween(d, today) > days;
}
