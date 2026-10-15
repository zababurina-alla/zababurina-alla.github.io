// Свой значок для вида срока (вид определяет читалка техники сайта — src/lib/obligation.ts, там же корпус).
// Значки — docs/словарь-значков.md, п. 3 «Обязательства».
import type { ObligationKind } from '../lib/obligation';
import type { IconName } from './Icon';

export const OBLIGATION_ICON: Record<ObligationKind, IconName> = {
  ep: 'taxEp', esv: 'esv', pdfo: 'taxPay', vz: 'vz', vat: 'vat', land: 'land', declaration: 'declaration', report: 'staffReport', other: 'documents',
};
