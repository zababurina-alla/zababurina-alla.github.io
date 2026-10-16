// «Нагрузка по неделям» (бот: workload_forecast) — сколько открытых сроков на каждой из ближайших недель, по снимку.
// Неделя — с понедельника. Просроченные — отдельно (их нужно закрыть раньше всех недель).
import { addDays, toUtc } from './dates';

export interface WeekLoad { start: string; end: string; count: number }

/** Понедельник недели, в которую попадает дата (ISO). */
export function mondayOf(iso: string): string {
  const dow = (new Date(toUtc(iso)).getUTCDay() + 6) % 7; // пн = 0
  return addDays(iso, -dow);
}

export function weekLoad(dues: readonly string[], today: string, weeks = 6): { overdue: number; weeks: WeekLoad[] } {
  const first = mondayOf(today);
  const out: WeekLoad[] = Array.from({ length: weeks }, (_, i) => ({ start: addDays(first, i * 7), end: addDays(first, i * 7 + 6), count: 0 }));
  let overdue = 0;
  for (const d of dues) {
    if (d < today) { overdue++; continue; }
    const w = out.find((x) => d >= x.start && d <= x.end);
    if (w) w.count++;
  }
  return { overdue, weeks: out };
}
