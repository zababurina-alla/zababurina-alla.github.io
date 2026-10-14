// Волна нагрузки для направления «Штиль»: высота воды в каждый день = открытые сроки около этого дня.
// Окно — 7 дней назад и 28 вперёд от «сегодня» (35 дней). Пороги цвета — как в таблице (п. 10).
import { statusByDays } from '../data';
import type { Deadline, Status } from '../data';

export const WAVE_W = 1000;
export const WAVE_H = 200;
export const BASE_Y = 176; // уровень спокойной воды
export const SAMPLES = 141;
export const DAYS_BACK = 7;
export const DAYS_SPAN = 35;

// Высота «горба» по статусу и его ширина — порог наш, подобран на глаз по макету, не проверен на живых данных.
const AMP: Record<Status, number> = { red: 96, orange: 80, yellow: 56, green: 36, grey: 0 };
const SIGMA_DAYS = 1.4;

export function dayOffset(due: string, today = '14.10.2026'): number {
  const p = (s: string) => {
    const [d, m, y] = s.split('.').map(Number);
    return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((p(due) - p(today)) / 86_400_000) + DAYS_BACK;
}

export function xOfDay(offset: number): number {
  const clamped = Math.min(Math.max(offset, 0.4), DAYS_SPAN - 0.4);
  return (clamped / DAYS_SPAN) * WAVE_W;
}

/** Высоты над спокойной водой в SAMPLES точках. */
export function heights(open: Deadline[]): number[] {
  const out = new Array<number>(SAMPLES).fill(0);
  for (const d of open) {
    const center = Math.min(Math.max(dayOffset(d.due), 0.4), DAYS_SPAN - 0.4);
    const amp = AMP[statusByDays(d.daysLeft)];
    for (let i = 0; i < SAMPLES; i++) {
      const day = (i / (SAMPLES - 1)) * DAYS_SPAN;
      out[i] = (out[i] ?? 0) + amp * Math.exp(-((day - center) ** 2) / (2 * SIGMA_DAYS ** 2));
    }
  }
  // Стоящие рядом сроки складываются; потолок — чтобы волна не вылезала из рамки.
  return out.map((h) => Math.min(h, BASE_Y - 16));
}

/** Путь поверхности воды (Catmull-Rom → кривые Безье) и залитая область под ней. */
export function wavePaths(h: number[], swell = 0, phase = 0): { area: string; line: string } {
  const pts = h.map((v, i) => [
    (i / (SAMPLES - 1)) * WAVE_W,
    BASE_Y - v - swell * Math.sin(i * 0.33 + phase) - swell * 0.5 * Math.sin(i * 0.11 - phase * 0.7),
  ] as const);
  let line = `M ${pts[0]?.[0].toFixed(1)} ${pts[0]?.[1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    if (!p0 || !p1 || !p2 || !p3) continue;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    line += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return { line, area: `${line} L ${WAVE_W} ${WAVE_H} L 0 ${WAVE_H} Z` };
}

export function surfaceY(h: number[], x: number): number {
  const i = Math.round((x / WAVE_W) * (SAMPLES - 1));
  return BASE_Y - (h[Math.min(Math.max(i, 0), SAMPLES - 1)] ?? 0);
}

/** Слово дня. Порог наш: есть просроченные → «Шторм», горит ≤ 3 дн. → «Волна», есть на неделе → «Рябь», иначе «Штиль». */
export function seaWord(open: Deadline[]): string {
  if (open.some((d) => d.daysLeft < 0)) return 'Шторм';
  if (open.some((d) => d.daysLeft <= 3)) return 'Волна';
  if (open.some((d) => d.daysLeft <= 7)) return 'Рябь';
  return 'Штиль';
}
