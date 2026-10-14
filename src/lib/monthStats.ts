// Суммы поступлений за месяц — из платежей, а не из констант: одно и то же для выдуманных и живых данных.
import { monthKey, prevMonthKey } from './dates';

interface Pay { kopecks: number | null; date: string; status?: string }

export interface MonthStats {
  key: string;
  total: number;
  count: number;
  prevKey: string;
  prevTotal: number;
  /** Нарастающий итог по дням с 1-го по сегодня, копейки: cumulative[0] — к концу 1-го числа. */
  cumulative: number[];
  /** Рост к прошлому месяцу, %; null — в прошлом месяце поступлений не было (сравнивать не с чем). */
  growth: number | null;
}

export function monthStats(payments: Pay[], today: string): MonthStats {
  const key = monthKey(today);
  const prevKey = prevMonthKey(key);
  const day = Number(today.slice(8, 10));
  const perDay = new Array<number>(day).fill(0);
  let total = 0;
  let count = 0;
  let prevTotal = 0;
  for (const p of payments) {
    // «Ожидается», «не получено», «возвращено» — не деньги в кассе.
    if (p.status !== undefined && p.status !== 'received') continue;
    if (p.kopecks === null) continue; // сумма не указана — в итог не идёт
    const k = monthKey(p.date);
    if (k === key) {
      const d = Number(p.date.slice(8, 10));
      if (d <= day) perDay[d - 1] = (perDay[d - 1] ?? 0) + p.kopecks;
      total += p.kopecks;
      count++;
    } else if (k === prevKey) {
      prevTotal += p.kopecks;
    }
  }
  let run = 0;
  const cumulative = perDay.map((v) => (run += v));
  const growth = prevTotal > 0 ? Math.round((total / prevTotal - 1) * 100) : null;
  return { key, total, count, prevKey, prevTotal, cumulative, growth };
}
