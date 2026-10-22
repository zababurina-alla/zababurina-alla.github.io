// Карточка клиента → доход за флагом incomeEdit: без флага — как было (только показ); с флагом — ввод и запись
// clients.update { income: { amountKopecks, basis } } через store.updateIncome с версией карточки; в очереди — «сохраняется…»;
// только просмотр (writes без clients) — «изменить — в таблице»; основа — из снимка, нет её — по типу клиента.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '../data/types';

const C = { id: 'c1', version: 9, name: 'Ромашко Іван Петрович', kind: 'fop3', marks: [], employer: false, kved: [], phone: '', keyIssuer: '', keyUntil: null, monthly: [],
  incomeKopecks: null, incomeBasis: 'quarterTurnover' } as unknown as Client;

const flags = { incomeEdit: true, canWriteClients: true };
const updateIncome = vi.fn();
let client: Client = C;
let pending: { op: { kind: string; id: string; patch?: Record<string, unknown> } }[] = [];

vi.mock('../config', async (orig) => ({
  ...(await orig<typeof import('../config')>()),
  hasFeature: (f: string) => (f === 'incomeEdit' ? flags.incomeEdit : true),
  canWrite: () => flags.canWriteClients,
}));
vi.mock('../data/store', () => ({
  useStore: () => ({
    pending, online: true, updateIncome, client: () => client,
    deadlines: [], undated: [], payments: [], tasks: [], questions: [], consultations: [], photos: {},
    loadClientCard: async () => [], createDeadline: null, templates: null, botLink: null, statement: { pdf: null, preview: null, send: null },
    archive: null, attention: null,
  }),
}));

// jsdom без matchMedia, а модули интерфейса спрашивают его при загрузке; <dialog> без showModal.
window.matchMedia ??= ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) { this.removeAttribute('open'); };

const { ClientPanel } = await import('./ClientPanel');
const { IncomeEdit, defaultIncomeBasis, parseIncome } = await import('./IncomeEdit');

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => { flags.incomeEdit = true; flags.canWriteClients = true; pending = []; client = C; updateIncome.mockClear(); });

let host: HTMLDivElement;
afterEach(() => { host.remove(); });

function render(node: React.ReactNode) {
  host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => { root.render(node); });
  return host;
}
function typeInto(el: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => { set?.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
}
const click = (b: Element | null) => act(() => { (b as HTMLElement).click(); });
const byText = (el: HTMLElement, text: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) ?? null;

describe('доход в карточке клиента', () => {
  it('без флага incomeEdit — в карточке доход только показан, кнопок «Указать» нет', () => {
    flags.incomeEdit = false;
    const el = render(<ClientPanel id="c1" onClose={() => undefined} />);
    expect(el.textContent).toContain('Оборот за квартал');
    expect(el.textContent).toContain('Годового дохода в таблице нет');
    expect(byText(el, 'Указать')).toBeNull();
    expect(el.querySelector('input[aria-label^="Оборот"]')).toBeNull();
  });

  it('с флагом: «Указать» → поле → «Сохранить» → updateIncome(id, { amountKopecks, basis }, версия карточки)', () => {
    const el = render(<ClientPanel id="c1" onClose={() => undefined} />);
    click(byText(el, 'Указать'));
    const input = el.querySelector('input[aria-label="Оборот за квартал, ₴"]') as HTMLInputElement;
    const save = byText(el, 'Сохранить') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    typeInto(input, '1 234 567,89');
    expect(save.disabled).toBe(false);
    click(save);
    expect(updateIncome).toHaveBeenCalledTimes(1);
    expect(updateIncome).toHaveBeenCalledWith('c1', { amountKopecks: 123456789, basis: 'quarterTurnover' }, 9);
  });

  it('основа yearProfit из снимка берётся как есть; ноль — верный доход', () => {
    client = { ...C, kind: 'fopGeneral', incomeBasis: 'yearProfit', incomeKopecks: 500000 } as Client;
    const el = render(<ClientPanel id="c1" onClose={() => undefined} />);
    expect(el.textContent).toContain('Прибыль за год');
    click(byText(el, 'Изменить'));
    const input = el.querySelector('input[aria-label="Прибыль за год, ₴"]') as HTMLInputElement;
    expect(input.value.replace(/\s/g, ' ')).toBe('5 000,00');
    typeInto(input, '0');
    click(byText(el, 'Сохранить'));
    expect(updateIncome).toHaveBeenCalledWith('c1', { amountKopecks: 0, basis: 'yearProfit' }, 9);
  });

  it('без основы в снимке: ФОП 3 → оборот за квартал, ФОП общая → прибыль за год, ФОП 1 — блока нет', () => {
    expect(defaultIncomeBasis('fop3')).toBe('quarterTurnover');
    expect(defaultIncomeBasis('tov3')).toBe('quarterTurnover');
    expect(defaultIncomeBasis('fopGeneral')).toBe('yearProfit');
    expect(defaultIncomeBasis('fop1')).toBeNull();
    client = { ...C, kind: 'fopGeneral', incomeBasis: null } as Client;
    let el = render(<ClientPanel id="c1" onClose={() => undefined} />);
    expect(el.textContent).toContain('Прибыль за год');
    el.remove();
    flags.incomeEdit = false;
    el = render(<ClientPanel id="c1" onClose={() => undefined} />);
    expect(el.textContent).not.toContain('Прибыль за год');
  });

  it('не число и минус — ошибка словами, запись не уходит', () => {
    const el = render(<IncomeEdit c={C} basis="quarterTurnover" />);
    click(byText(el, 'Указать'));
    const input = el.querySelector('input') as HTMLInputElement;
    typeInto(input, 'abc');
    expect((byText(el, 'Сохранить') as HTMLButtonElement).disabled).toBe(true);
    expect(el.textContent).toContain('только цифры');
    typeInto(input, '-5');
    expect(el.textContent).toContain('не может быть отрицательным');
    expect(updateIncome).not.toHaveBeenCalled();
    expect(parseIncome('0,00 ₴')).toEqual({ ok: true, kopecks: 0 });
    expect(parseIncome('12,5')).toEqual({ ok: true, kopecks: 1250 });
  });

  it('запись в очереди — «сохраняется…», кнопок нет', () => {
    pending = [{ op: { kind: 'updateClient', id: 'c1', patch: { income: { amountKopecks: 1, basis: 'quarterTurnover' } } } }];
    const el = render(<IncomeEdit c={C} basis="quarterTurnover" />);
    expect(el.textContent).toContain('сохраняется');
    expect(el.querySelector('button')).toBeNull();
  });

  it('очередь с чужой правкой клиента (телефон) доход не блокирует', () => {
    pending = [{ op: { kind: 'updateClient', id: 'c1', patch: { phone: '+380' } } }];
    const el = render(<IncomeEdit c={C} basis="quarterTurnover" />);
    expect(byText(el, 'Указать')).not.toBeNull();
  });

  it('только просмотр (writes без clients) — «изменить — в таблице», кнопки нет', () => {
    flags.canWriteClients = false;
    const el = render(<IncomeEdit c={C} basis="quarterTurnover" />);
    expect(el.textContent).toContain('изменить — в таблице');
    expect(byText(el, 'Указать')).toBeNull();
  });
});
