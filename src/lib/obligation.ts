// Вид срока по тексту из таблицы — для фильтра на «Сроках»: ЄП, ЄСВ, декларации, отчёты, другое.
// Это читалка: корпус «текст → вид» и «верно N из M» — в obligation.test.ts.
// Порядок важен: «Декларація платника ЄП» — декларация, «Звіт з ЄСВ» — отчёт, а не ЄП и не ЄСВ.
import { fold } from './search';

export type ObligationKind = 'ep' | 'esv' | 'declaration' | 'report' | 'other';

export const OBLIGATION_LABEL: Record<ObligationKind, string> = {
  ep: 'ЄП', esv: 'ЄСВ', declaration: 'Декларации', report: 'Отчёты', other: 'Другое',
};

// После fold: є→е, і/ї/ы/й→и, мягкий знак убран.
const RULES: [RegExp, ObligationKind][] = [
  [/декларац/, 'declaration'],
  [/(^|[^а-я])(звит|отчет)|розрахун|расчет|1дф|(^|[^а-я0-9])д4([^а-я0-9]|$)/, 'report'],
  [/(^|[^а-я])есв([^а-я]|$)/, 'esv'],
  [/(^|[^а-я])еп([^а-я]|$)|единии (податок|налог)/, 'ep'],
];

export function obligationKind(what: string): ObligationKind {
  const t = fold(what);
  for (const [re, kind] of RULES) if (re.test(t)) return kind;
  return 'other';
}
