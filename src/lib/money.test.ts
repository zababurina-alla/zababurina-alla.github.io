import { describe, expect, it } from 'vitest';
import { formatMoney, parseMoney } from './money';

// Корпус «как мама вводит → сколько копеек». Новый случай ошибки — сюда (правило владельца: корпус растёт с ошибкой).
const CORPUS: [string, number | null][] = [
  ['1234.56', 123456],
  ['1 234,56', 123456],
  ['1234,5', 123450],
  ['1234', 123400],
  ['1 234 ₴', 123400],
  ['1.234,56', 123456],
  ['1,234.56', 123456],
  ['1 902,34', 190234],
  ['332,8', 33280],
  ['0,5', 50],
  ['  8647  ', 864700],
  ['8 647 грн', 864700],
  ['1729.40', 172940],
  ['1.234', 123400],
  ['12,34', 1234],
  ['5707,02₴', 570702],
  ['100000', 10000000],
  ['1 234,56', 123456],
  ['1 234,56', 123456],
  ["1'234.50", 123450],
  ['', null],
  ['0', null],
  ['-100', null],
  ['12,345,67', null],
  ['abc', null],
  ['1,234', 123400],
  ['3,328', 332800],
  ['12.3456', null],
  ['1,234,567', 123456700],
  ['1.234.567,89', 123456789],
];

describe('разбор суммы: корпус', () => {
  const results = CORPUS.map(([input, want]) => {
    const r = parseMoney(input);
    const got = r.ok ? r.kopecks : null;
    return { input, want, got, ok: got === want };
  });
  const right = results.filter((r) => r.ok).length;

  it(`верно ${right} из ${CORPUS.length}`, () => {
    // Печатаем число в журнал тестов — мера точности читалки (правило владельца, п. 2.3).
    console.log(`Разбор суммы: верно ${right} из ${CORPUS.length}`);
    expect(results.filter((r) => !r.ok)).toEqual([]);
  });
});

describe('ошибки простыми словами', () => {
  it('ноль и минус', () => {
    expect(parseMoney('0')).toEqual({ ok: false, error: 'Сумма должна быть больше нуля' });
    expect(parseMoney('-5')).toEqual({ ok: false, error: 'Сумма должна быть больше нуля' });
  });
  it('пусто', () => expect(parseMoney(' ')).toEqual({ ok: false, error: 'Введите сумму' }));
});

describe('показ суммы', () => {
  it('одинаково для любого ввода', () => {
    for (const s of ['1234.56', '1 234,56', '1.234,56']) {
      const r = parseMoney(s);
      expect(r.ok && formatMoney(r.kopecks)).toBe('1 234,56 ₴');
    }
  });
  it('мелкие и большие', () => {
    expect(formatMoney(50)).toBe('0,50 ₴');
    expect(formatMoney(1234567890)).toBe('12 345 678,90 ₴');
  });
});
