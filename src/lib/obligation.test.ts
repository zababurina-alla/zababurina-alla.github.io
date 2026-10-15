import { describe, expect, it } from 'vitest';
import { DEADLINES } from '../data/fake';
import { obligationKind } from './obligation';

// Корпус «текст срока из таблицы → вид для фильтра». Первые 14 — все сроки выдуманных данных, дальше — частые
// формулировки таблицы (укр. и рус.). Новый промах — сюда.
const FROM_FAKE: Record<string, string> = {
  d1: 'ep', d2: 'esv', d3: 'report', d4: 'esv', d5: 'ep', d6: 'ep', d7: 'esv', d8: 'report',
  d9: 'declaration', d10: 'declaration', d11: 'declaration', d12: 'declaration', d13: 'ep', d14: 'report',
};
const CORPUS: [string, string][] = [
  ...DEADLINES.map((d): [string, string] => [d.what, FROM_FAKE[d.id] ?? '?']),
  ['Єдиний податок за жовтень', 'ep'],
  ['Единый налог за III квартал', 'ep'],
  ['ЄСВ за себе, IV квартал', 'esv'],
  ['Звіт з ЄСВ (Д4), вересень', 'report'],
  ['Податкова декларація з ПДВ, вересень', 'declaration'],
  ['Військовий збір за III квартал', 'other'],
  ['Подати 1ДФ (податковий розрахунок)', 'report'],
  ['Сплатити ПДФО за працівників', 'other'],
];

describe('вид срока по тексту: корпус', () => {
  const results = CORPUS.map(([what, want]) => ({ what, want, got: obligationKind(what) }));
  const right = results.filter((r) => r.got === r.want).length;
  it(`верно ${right} из ${CORPUS.length}`, () => {
    console.log(`Вид срока: верно ${right} из ${CORPUS.length}`);
    expect(CORPUS.length).toBeGreaterThanOrEqual(20);
    expect(results.filter((r) => r.got !== r.want)).toEqual([]);
  });
});
