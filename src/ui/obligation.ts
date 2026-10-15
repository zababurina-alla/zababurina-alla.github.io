// Вид обязательства по тексту срока из таблицы («ЄСВ за III квартал», «Декларація платника ЄП, 2026 рік») — для своего
// значка в строке, фильтра и группировки на «Сроках». Это только отображение: текст срока не меняется.
// Это читалка: корпус и «верно N из M» — obligation.test.ts. Значки и названия — docs/словарь-значков.md, п. 3.
// Порядок правил важен: «Декларація платника ЄП» — декларация, а не ЄП; «Податковий розрахунок» — раньше «ПДФО».
import type { IconName } from './Icon';

export type ObligationKind = 'declaration' | 'staffReport' | 'esv' | 'ep' | 'pdfo' | 'vz' | 'vat' | 'property' | 'land' | 'other';

export const OBLIGATION: Record<ObligationKind, { label: string; icon: IconName }> = {
  declaration: { label: 'Декларации', icon: 'declaration' },
  staffReport: { label: 'Розрахунки, 4ДФ', icon: 'staffReport' },
  esv: { label: 'ЄСВ', icon: 'esv' },
  ep: { label: 'ЄП', icon: 'taxEp' },
  pdfo: { label: 'ПДФО и налоги', icon: 'taxPay' },
  vz: { label: 'Военный сбор', icon: 'vz' },
  vat: { label: 'ПДВ', icon: 'vat' },
  property: { label: 'Майновий стан', icon: 'property' },
  land: { label: 'Земля', icon: 'land' },
  other: { label: 'Другое', icon: 'documents' },
};

// Слово целиком: \b в JS понимает только латиницу, поэтому граница — «не буква» по Unicode.
const word = (w: string) => new RegExp(`(?<!\\p{L})(?:${w})(?!\\p{L})`, 'iu');

const RULES: [RegExp, ObligationKind][] = [
  [/декларац|звіт|отч[её]т|баланс/iu, 'declaration'],
  [/розрахун|4\s?дф|по найманих|по наёмн/iu, 'staffReport'],
  [/майнов/iu, 'property'],
  [word('єсв|есв'), 'esv'],
  [word('пдв|ндс'), 'vat'],
  [/військов|воєн|воен/iu, 'vz'],
  [word('вз'), 'vz'],
  [/пдфо|ндфл|аванс|податок на доход|налог на доход/iu, 'pdfo'],
  [word('єп|еп'), 'ep'],
  [/єдин(ий|ого) под|единый нал/iu, 'ep'],
  [/земл|оренд/iu, 'land'],
];

export function obligationOf(what: string): ObligationKind {
  return RULES.find(([re]) => re.test(what))?.[1] ?? 'other';
}
