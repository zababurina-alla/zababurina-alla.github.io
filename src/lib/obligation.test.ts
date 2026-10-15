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
  ['Військовий збір за III квартал', 'vz'],
  ['Подати 1ДФ (податковий розрахунок)', 'report'],
  ['Сплатити ПДФО за працівників', 'pdfo'],
  // Живая таблица 15.10.2026 — все 9 формулировок «⏰ Сроки» (123 срока; находка «Пользователя» п. 13).
  ['Аванс ПДФО (ІІІ квартал)', 'pdfo'],
  ['Аванс ПДФО (ІІ квартал)', 'pdfo'],
  ['Аванс ПДФО (І квартал)', 'pdfo'],
  ['Квартальна декларація ЄП (3 гр) за III кв. 2026', 'declaration'],
  ['Квартальна декларація ЄП (3 гр) за IV кв. 2026', 'declaration'],
  ['Квартальна декларація ЄП (ТОВ) за IV кв. 2026', 'declaration'],
  ['Річна декларація ФОП (2 гр) за 2026 год', 'declaration'],
  ['Річна декларація ФОП (1 гр) за 2026 год', 'declaration'],
  ['Річна декларація (ПДФО+ВЗ+ЄСВ) за 2026 год', 'declaration'],
  // Образцы отдела дизайна (их корпус значков, 15.10.2026).
  ['Військовий збір за жовтень', 'vz'],
  ['ВЗ ФОП 1 група, жовтень', 'vz'],
  ['Аванс ПДФО за жовтень', 'pdfo'],
  ['ПДФО з дивідендів', 'pdfo'],
  ['ПДВ за вересень', 'vat'],
  ['Оренда землі, жовтень', 'land'],
  ['Баланс за 9 місяців', 'report'],
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
