import { describe, expect, it } from 'vitest';
import { telegramLink } from './contact';

// Корпус «как телефон записан в таблице → ссылка в Telegram». Новый промах — сюда.
const CORPUS: [string | null, string | null][] = [
  ['📞 +380 (50) 123-45-67', 'https://t.me/+380501234567'], // так телефон пишет сервер
  ['+380 (50) 123-45-67', 'https://t.me/+380501234567'],
  ['+380501234567', 'https://t.me/+380501234567'],
  ['380501234567', 'https://t.me/+380501234567'],
  ['0501234567', 'https://t.me/+380501234567'],
  ['050 123 45 67', 'https://t.me/+380501234567'],
  ['050-123-45-67', 'https://t.me/+380501234567'],
  ['(050) 123-45-67', 'https://t.me/+380501234567'],
  ['+38 (050) 123 45 67', 'https://t.me/+380501234567'],
  ['501234567', 'https://t.me/+380501234567'],
  ['067.765.43.21', 'https://t.me/+380677654321'],
  ['+48 512 345 678', 'https://t.me/+48512345678'],
  ['+1 (202) 555-0147', 'https://t.me/+12025550147'],
  ['0501234567, 0671112233', 'https://t.me/+380501234567'],
  ['0501234567;0671112233', 'https://t.me/+380501234567'],
  ['', null],
  ['   ', null],
  [null, null],
  ['нет', null],
  ['12345', null],
  ['050 123', null],
  ['0501234567 доб. 12', null],
];

describe('ссылка в Telegram по телефону: корпус', () => {
  const results = CORPUS.map(([s, want]) => ({ s, want, got: telegramLink(s) }));
  const right = results.filter((r) => r.got === r.want).length;
  it(`верно ${right} из ${CORPUS.length}`, () => {
    console.log(`Ссылка в Telegram: верно ${right} из ${CORPUS.length}`);
    expect(results.filter((r) => r.got !== r.want)).toEqual([]);
  });
});
