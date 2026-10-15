import { describe, expect, it } from 'vitest';
import { PAYMENTS } from '../data/fake';
import { growthLabel, monthStats } from './monthStats';
import { daysInMonth, kyivToday, monthName, prevMonthKey } from './dates';

describe('суммы за месяц', () => {
  it('октябрь и сентябрь на выдуманных данных — как было на экране (20 700 и 18 500 ₴)', () => {
    const s = monthStats(PAYMENTS, '2026-10-14');
    expect(s.total).toBe(2_070_000);
    expect(s.prevTotal).toBe(1_850_000);
    expect(s.count).toBe(8);
    expect(s.growth).toBe(12);
    expect(s.cumulative).toHaveLength(14);
    expect(s.cumulative[0]).toBe(0);
    expect(s.cumulative[1]).toBe(500_000);
    expect(s.cumulative.at(-1)).toBe(2_070_000);
  });

  it('январь сравнивается с декабрём прошлого года; пустой прошлый месяц — без процента', () => {
    const s = monthStats([{ kopecks: 100, date: '2027-01-02' }, { kopecks: 50, date: '2026-12-31' }], '2027-01-05');
    expect([s.key, s.prevKey, s.total, s.prevTotal]).toEqual(['2027-01', '2026-12', 100, 50]);
    expect(monthStats([{ kopecks: 100, date: '2027-01-02' }], '2027-01-05').growth).toBeNull();
  });

  it('«ожидается», «не получено», «возвращено» в суммы не идут', () => {
    const s = monthStats([
      { kopecks: 100, date: '2026-10-02', status: 'received' }, { kopecks: 1000, date: '2026-10-03', status: 'expected' },
      { kopecks: 10000, date: '2026-10-04', status: 'returned' }, { kopecks: 5, date: '2026-10-05' },
    ], '2026-10-14');
    expect([s.total, s.count]).toEqual([105, 2]);
  });

  it('месяцы словами и число дней', () => {
    expect([monthName('2026-10', 'nom'), monthName('2026-10', 'prep'), monthName('2026-09', 'gen')]).toEqual(['Октябрь', 'октябре', 'сентября']);
    expect([prevMonthKey('2026-01'), daysInMonth('2026-02'), daysInMonth('2028-02'), daysInMonth('2026-10')]).toEqual(['2025-12', 28, 29, 31]);
  });

  it('сегодня — по Киеву, а не по часам компьютера', () => {
    // 21:30 UTC 14.10 — в Киеве (UTC+3) уже 15.10.
    expect(kyivToday(new Date('2026-10-14T21:30:00Z'))).toBe('2026-10-15');
    // Зимнее время (UTC+2): 22:30 UTC 31.12 — в Киеве 01.01.
    expect(kyivToday(new Date('2026-12-31T22:30:00Z'))).toBe('2027-01-01');
  });

  it('пустая дата или сумма в листе — не роняет и в итоги не идёт (живые данные 15.10)', () => {
    const s = monthStats([
      { kopecks: 100, date: '2026-10-02' }, { kopecks: 1000, date: null }, { kopecks: null, date: '2026-10-03' }, { kopecks: null, date: null },
      { kopecks: 7, date: '2026-09-30' },
    ], '2026-10-14');
    expect([s.total, s.count, s.prevTotal]).toEqual([100, 1, 7]);
    expect(s.cumulative.at(-1)).toBe(100);
  });

  it('рост со знаком: «−100 %», когда месяц пустой, а прошлый — нет (п. 39)', () => {
    const s = monthStats([{ kopecks: 905000, date: '2026-06-10' }], '2026-07-31');
    expect([s.total, s.growth, growthLabel(s.growth)]).toEqual([0, -100, '−100 %']);
    expect(growthLabel(12)).toBe('+12 %');
    expect(growthLabel(0)).toBeNull();
    expect(growthLabel(null)).toBeNull();
  });
});
