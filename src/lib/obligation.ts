// Вид срока по тексту из таблицы — для фильтра на «Сроках»: ЄП, ЄСВ, ПДФО, ВЗ, ПДВ, земля, декларации, отчёты, другое.
// Это читалка: корпус «текст → вид» и «верно N из M» — в obligation.test.ts.
// Порядок важен: «Декларація платника ЄП» и «Річна декларація (ПДФО+ВЗ+ЄСВ)» — декларация, «Звіт з ЄСВ» — отчёт.
import { fold } from './search';

export type ObligationKind = 'ep' | 'esv' | 'pdfo' | 'vz' | 'vat' | 'land' | 'declaration' | 'report' | 'other';

export const OBLIGATION_LABEL: Record<ObligationKind, string> = {
  ep: 'ЄП', esv: 'ЄСВ', pdfo: 'ПДФО', vz: 'Военный сбор', vat: 'ПДВ', land: 'Земля', declaration: 'Декларации', report: 'Отчёты', other: 'Другое',
};

// После fold: є→е, і/ї/ы/й→и, мягкий знак убран.
const RULES: [RegExp, ObligationKind][] = [
  [/декларац/, 'declaration'],
  [/(^|[^а-я])(звит|отчет)|розрахун|расчет|1дф|(^|[^а-я0-9])д4([^а-я0-9]|$)|(^|[^а-я])баланс/, 'report'],
  [/(^|[^а-я])есв([^а-я]|$)/, 'esv'],
  [/(^|[^а-я])еп([^а-я]|$)|единии (податок|налог)/, 'ep'],
  [/(^|[^а-я])(пдфо|ндфл)([^а-я]|$)/, 'pdfo'],
  [/(^|[^а-я])вз([^а-я]|$)|виисковии збир|военнии сбор/, 'vz'],
  [/(^|[^а-я])(пдв|ндс)([^а-я]|$)/, 'vat'],
  [/(оренд|аренд)[а-я]* земл|земельн/, 'land'],
];

export function obligationKind(what: string): ObligationKind {
  const t = fold(what);
  for (const [re, kind] of RULES) if (re.test(t)) return kind;
  return 'other';
}
