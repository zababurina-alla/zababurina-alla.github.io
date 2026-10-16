import { describe, expect, it } from 'vitest';
import { parseMinutes } from './Consultations';

// Корпус «как мама пишет минуты → что уходит на сервер» (целое 1–1440 или пусто). Новый промах — сюда.
const CORPUS: [string, number | null | 'error'][] = [
  ['', null], ['   ', null], ['15', 15], [' 15 ', 15], ['1', 1], ['1440', 1440], ['90', 90],
  ['15 мин', 15], ['15мин', 15], ['15 мин.', 15], ['20 хв', 20], ['30 МИН', 30], ['05', 5],
  ['0', 'error'], ['1441', 'error'], ['15,5', 'error'], ['1.5', 'error'], ['полчаса', 'error'], ['-5', 'error'],
  ['15 минут', 'error'], ['1 500', 'error'], ['2ч', 'error'],
];

describe('минуты консультации: корпус', () => {
  const results = CORPUS.map(([s, want]) => {
    const r = parseMinutes(s);
    return { s, want, got: r.ok ? r.value : 'error' };
  });
  const right = results.filter((r) => r.got === r.want).length;
  it(`верно ${right} из ${CORPUS.length}`, () => {
    console.log(`Минуты консультации: верно ${right} из ${CORPUS.length}`);
    expect(results.filter((r) => r.got !== r.want)).toEqual([]);
  });
});
