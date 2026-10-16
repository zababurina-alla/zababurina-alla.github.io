import { describe, expect, it } from 'vitest';
import { parseKvedCode } from './kvedCode';

// Корпус «как мама пишет код КВЕД → что уходит в clients.update» (null — «проверьте код»). Новый промах — сюда.
const CORPUS: [string, string | null][] = [
  ['47.21', '47.21'], ['47,21', '47.21'], ['4721', '47.21'], [' 47.21 ', '47.21'], ['47 21', '47.21'],
  ['47 . 21', '47.21'], ['КВЕД 47.21', '47.21'], ['квед: 56.10', '56.10'], ['kved 62.01', '62.01'], ['01.11', '01.11'],
  ['96.02', '96.02'], ['43,39', '43.39'], ['4299', '42.99'],
  ['47.2', null], ['47', null], ['472', null], ['47.211', null], ['47.21.1', null], ['ab.cd', null], ['', null],
  ['00.00', null], ['47-21', null], ['торгівля', null],
];

describe('код КВЕД: корпус', () => {
  const results = CORPUS.map(([s, want]) => ({ s, want, got: parseKvedCode(s) }));
  const right = results.filter((r) => r.got === r.want).length;
  it(`верно ${right} из ${CORPUS.length}`, () => {
    console.log(`Код КВЕД: верно ${right} из ${CORPUS.length}`);
    expect(results.filter((r) => r.got !== r.want)).toEqual([]);
  });
});
