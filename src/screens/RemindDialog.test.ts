import { describe, expect, it } from 'vitest';
import { remindDraft } from './RemindDialog';
import type { Client, DatedDeadline } from '../data/types';

const c = (name: string, keyUntil: string | null = '2026-10-20'): Client =>
  ({ id: 'c1', name, kind: 'fop2', marks: [], employer: false, kved: [], phone: '', keyIssuer: '', keyUntil, monthly: [], version: 1 });
const dl: DatedDeadline = { id: 'd1', version: 1, clientId: 'c1', what: '💵 Аванс ПДФО (ІІІ квартал)', periodicity: 'quarter', due: '2026-10-20', periodEnd: '2026-09-30', status: 'new', closedAt: null };

describe('черновик напоминания клиенту', () => {
  it('срок: по имени, без эмодзи, дата по-нашему', () => {
    expect(remindDraft(c('Ромашко Олена Петрівна'), { deadline: dl }))
      .toBe('Добрий день, Олена! Нагадую: «Аванс ПДФО (ІІІ квартал)» — термін до 20.10.2026. Якщо вже все зроблено — дякую, просто напишіть мені.');
  });
  it('ключ ЭЦП; у ТОВ — без имени', () => {
    expect(remindDraft(c('ТОВ «Чайка-Сервіс»'), { key: true }))
      .toBe('Добрий день! Ваш ключ ЕЦП діє до 20.10.2026. Його треба продовжити — напишіть, коли вам зручно.');
  });
});
