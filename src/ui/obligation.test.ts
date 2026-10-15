// Корпус читалки «вид обязательства по тексту срока». Образцы — формы, в которых сроки пишутся в таблице «Мамы CRM»
// и в боте (сущности.md, № 21–36), плюс ловушки (ЄП внутри декларации, «есв» внутри слова). Ошибка на живых данных —
// новый образец сюда.
import { describe, expect, it } from 'vitest';
import { obligationOf } from './obligation';
import type { ObligationKind } from './obligation';

const CORPUS: [string, ObligationKind][] = [
  ['ЄП за сентябрь', 'ep'],
  ['ЄП за жовтень', 'ep'],
  ['💰 ЄП за ІІІ квартал', 'ep'],
  ['Единый налог за октябрь', 'ep'],
  ['Сплата єдиного податку, листопад', 'ep'],
  ['ЄСВ за III квартал', 'esv'],
  ['ЄСВ за IV квартал', 'esv'],
  ['☂️ ЄСВ за себе, 2026', 'esv'],
  ['Декларація платника ЄП, III кв.', 'declaration'],
  ['Декларація платника ЄП, 2026 рік', 'declaration'],
  ['📝 Декларація з ПДВ, вересень', 'declaration'],
  ['Звіт з ЄСВ, сентябрь', 'declaration'],
  ['Декларація з податку на прибуток', 'declaration'],
  ['Баланс за 9 місяців', 'declaration'],
  ['Податковий розрахунок, III квартал', 'staffReport'],
  ['Податковий розрахунок, IV квартал', 'staffReport'],
  ['4ДФ за ІІІ квартал', 'staffReport'],
  ['Декларація про майновий стан', 'declaration'],
  ['Майновий стан і доходи', 'property'],
  ['Аванс ПДФО за жовтень', 'pdfo'],
  ['ПДФО з дивідендів', 'pdfo'],
  ['Військовий збір за жовтень', 'vz'],
  ['ВЗ ФОП 1 група, жовтень', 'vz'],
  ['ПДВ за вересень', 'vat'],
  ['Оренда землі, жовтень', 'land'],
  ['Подать 5-ПН', 'other'],
  ['Продлить ключ ЭЦП', 'other'],
  ['Чесвинська — первичка', 'other'],
];

describe('вид обязательства по тексту срока', () => {
  const ok = CORPUS.filter(([t, k]) => obligationOf(t) === k).length;
  it(`верно ${ok} из ${CORPUS.length}`, () => {
    const wrong = CORPUS.filter(([t, k]) => obligationOf(t) !== k).map(([t, k]) => `${t} → ${obligationOf(t)}, ждали ${k}`);
    expect(wrong).toEqual([]);
  });
  it('корпус не меньше 20 образцов', () => expect(CORPUS.length).toBeGreaterThanOrEqual(20));
});
