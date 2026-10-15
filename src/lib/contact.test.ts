import { describe, expect, it } from 'vitest';
import { emailProblem, normEmail, phoneProblem } from './contact';

// Корпус «что ввела мама → годится ли» (правила сервера v5.71: 9–15 цифр; почта — нижним регистром).
const PHONES: [string, boolean][] = [
  ['+380501234567', true], ['050 123 45 67', true], ['+38 (050) 123-45-67', true], ['0501234567', true],
  ['501234567', true], ['+48 123 456 789', true], ['', true], ['   ', true],
  ['12345678', false], ['+380 50 123 45 67 89 01 2', false], ['050-123-45-6x', false], ['телефон', false],
];
const EMAILS: [string, boolean][] = [
  ['olena@ukr.net', true], ['Olena.Romashko@Gmail.com', true], ['', true],
  ['olena@ukr', false], ['olena ukr.net', false], ['@ukr.net', false],
];

describe('контакты до отправки', () => {
  const results = [
    ...PHONES.map(([v, ok]) => ({ v, ok, got: phoneProblem(v) === null })),
    ...EMAILS.map(([v, ok]) => ({ v, ok, got: emailProblem(v) === null })),
  ];
  const right = results.filter((r) => r.ok === r.got).length;
  it(`верно ${right} из ${results.length}`, () => {
    console.log(`Контакты: верно ${right} из ${results.length}`);
    expect(results.length).toBeGreaterThanOrEqual(18);
    expect(results.filter((r) => r.ok !== r.got)).toEqual([]);
  });
  it('почта уходит нижним регистром; ошибка телефона называет число цифр', () => {
    expect(normEmail('  Olena.Romashko@Gmail.com ')).toBe('olena.romashko@gmail.com');
    expect(phoneProblem('12345678')).toBe('В телефоне 8 цифр — нужно от 9 до 15');
  });
});
