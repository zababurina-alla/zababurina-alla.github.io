import { describe, expect, it } from 'vitest';
import { greeting, kyivHour } from './greeting';

describe('приветствие по часам Киева', () => {
  it('границы: 05, 12, 18, 23 — новое приветствие с первой минуты', () => {
    expect([4, 5, 11, 12, 17, 18, 22, 23, 0].map(greeting)).toEqual([
      'Доброй ночи', 'Доброе утро', 'Доброе утро', 'Добрый день', 'Добрый день',
      'Добрый вечер', 'Добрый вечер', 'Доброй ночи', 'Доброй ночи',
    ]);
  });

  it('00:30 в Киеве — ночь, хоть часы компьютера и в другом поясе (летом UTC+3)', () => {
    const at = new Date('2026-10-16T21:30:00Z');
    expect(kyivHour(at)).toBe(0);
    expect(greeting(kyivHour(at))).toBe('Доброй ночи');
  });

  it('зимой UTC+2: 21:30 UTC — 23:30 в Киеве, ночь; 03:00 UTC — 05:00, утро', () => {
    expect(kyivHour(new Date('2026-12-01T21:30:00Z'))).toBe(23);
    expect(greeting(kyivHour(new Date('2026-12-01T03:00:00Z')))).toBe('Доброе утро');
  });
});
