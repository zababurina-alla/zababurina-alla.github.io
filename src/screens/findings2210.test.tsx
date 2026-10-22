// Находки прогона на тестовом клиенте 22.10: С-1 — КВЕД, набранный без «Добавить», «Сохранить» молча терял;
// С-2 — окно платежа из карточки подставляло клиента из старого черновика; С-3 — телефон «📞 +380 …» в поле правки
// не проходил проверку, «Сохранить» было не нажать.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '../data/types';

const C = { id: 'c1', version: 9, name: 'Ромашко Іван Петрович', kind: 'fop3', marks: [], employer: false,
  kved: [{ code: '47.21', title: '' }], kvedMain: null, phone: '📞 +380 (50) 123-45-67', email: '', keyIssuer: '', keyUntil: null,
  monthly: [], incomeKopecks: null, incomeBasis: 'quarterTurnover' } as unknown as Client;
const C2 = { ...C, id: 'c2', name: 'Петренко Олена' } as unknown as Client;

const updateKved = vi.fn();
const updatePhone = vi.fn();
const drafts = new Map<string, unknown>();

vi.mock('../config', async (orig) => ({
  ...(await orig<typeof import('../config')>()),
  hasFeature: () => true,
  canWrite: () => true,
}));
vi.mock('../data/idb', () => ({
  kvGet: async (_s: string, k: string) => drafts.get(k),
  kvSet: async (_s: string, k: string, v: unknown) => { drafts.set(k, v); },
  kvDelete: async (_s: string, k: string) => { drafts.delete(k); },
}));
vi.mock('../data/store', () => ({
  useStore: () => ({
    pending: [], online: true, updateKved, updatePhone, updateEmail: vi.fn(), updateIncome: vi.fn(),
    client: (id: string) => [C, C2].find((c) => c.id === id), clients: [C, C2],
    deadlines: [], undated: [], payments: [], tasks: [], questions: [], consultations: [], photos: {},
    loadClientCard: async () => [], createDeadline: null, templates: null, botLink: null, statement: { pdf: null, preview: null, send: null },
    archive: null, attention: null, addPayment: vi.fn(),
  }),
}));
vi.mock('../ui/toast', () => ({ useToast: () => vi.fn() }));

window.matchMedia ??= ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) { this.removeAttribute('open'); };

const { KvedEdit } = await import('./KvedEdit');
const { ClientPanel } = await import('./ClientPanel');
const { PaymentDialog } = await import('./PaymentDialog');

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => { updateKved.mockClear(); updatePhone.mockClear(); drafts.clear(); });

let roots: Root[] = [];
let hosts: HTMLElement[] = [];
afterEach(() => { act(() => { roots.forEach((r) => r.unmount()); }); roots = []; hosts.forEach((h) => h.remove()); hosts = []; });

function render(node: React.ReactNode) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root); hosts.push(host);
  act(() => { root.render(node); });
  return host;
}
function typeInto(el: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => { set?.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
}
const click = (b: Element | null) => act(() => { (b as HTMLElement).click(); });
const btn = (el: HTMLElement, text: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) ?? null;

describe('С-1: КВЕД набран, «Добавить» не нажат', () => {
  it('«Сохранить» отправляет список вместе с набранным кодом', () => {
    const el = render(<KvedEdit c={C} />);
    click(btn(el, 'Изменить КВЕД'));
    typeInto(el.querySelector('input[aria-label="Код КВЕД"]') as HTMLInputElement, '62.01');
    click(btn(el, 'Сохранить'));
    expect(updateKved).toHaveBeenCalledWith('c1', ['47.21', '62.01'], 9);
  });

  it('код с ошибкой — ошибка на экране, запись не уходит, правка остаётся открытой', () => {
    const el = render(<KvedEdit c={C} />);
    click(btn(el, 'Изменить КВЕД'));
    typeInto(el.querySelector('input[aria-label="Код КВЕД"]') as HTMLInputElement, 'абв');
    click(btn(el, 'Сохранить'));
    expect(updateKved).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Код КВЕД — в виде 47.21');
    expect(btn(el, 'Сохранить')).not.toBeNull();
  });

  it('дубль набранного кода — «уже в списке», запись не уходит', () => {
    const el = render(<KvedEdit c={C} />);
    click(btn(el, 'Изменить КВЕД'));
    typeInto(el.querySelector('input[aria-label="Код КВЕД"]') as HTMLInputElement, '47.21');
    click(btn(el, 'Сохранить'));
    expect(updateKved).not.toHaveBeenCalled();
    expect(el.textContent).toContain('47.21 уже в списке');
  });

  it('поле пустое — уходит список как есть (удаление кода работает как раньше)', () => {
    const el = render(<KvedEdit c={C} />);
    click(btn(el, 'Изменить КВЕД'));
    click(el.querySelector('button[aria-label="Убрать 47.21"]'));
    click(btn(el, 'Сохранить'));
    expect(updateKved).toHaveBeenCalledWith('c1', [], 9);
  });
});

describe('С-3: телефон со значком «📞»', () => {
  it('в поле правки — без значка, проверка проходит; без изменений запись не уходит', () => {
    const el = render(<ClientPanel id="c1" onClose={() => undefined} />);
    click(btn(el, 'Изменить телефон'));
    const input = el.querySelector('input[aria-label="Телефон"]') as HTMLInputElement;
    expect(input.value).toBe('+380 (50) 123-45-67');
    const save = btn(el, 'Сохранить') as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    click(save);
    expect(updatePhone).not.toHaveBeenCalled();
  });

  it('новый номер уходит без значка', () => {
    const el = render(<ClientPanel id="c1" onClose={() => undefined} />);
    click(btn(el, 'Изменить телефон'));
    typeInto(el.querySelector('input[aria-label="Телефон"]') as HTMLInputElement, '050 765 43 21');
    click(btn(el, 'Сохранить'));
    expect(updatePhone).toHaveBeenCalledWith('c1', '050 765 43 21', 9);
  });
});

describe('С-2: черновик платежа другого клиента', () => {
  const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

  it('окно из карточки c1, в черновике c2 — клиент остаётся c1, «Восстановлен черновик» не показан', async () => {
    drafts.set('payment', { value: { who: 'c2', amount: '', period: 'Октябрь 2026', method: 'bank', date: '22.10.2026' }, savedAt: Date.now() });
    render(<PaymentDialog open clientId="c1" onClose={() => undefined} />);
    await flush();
    expect(document.body.textContent).toContain('Ромашко Іван Петрович');
    expect(document.body.textContent).not.toContain('Петренко');
    expect(document.body.textContent).not.toContain('Восстановлен черновик');
  });

  it('черновик того же клиента с суммой — восстанавливается', async () => {
    drafts.set('payment', { value: { who: 'c1', amount: '500', period: 'Октябрь 2026', method: 'cash', date: '22.10.2026' }, savedAt: Date.now() });
    render(<PaymentDialog open clientId="c1" onClose={() => undefined} />);
    await flush();
    expect(document.body.textContent).toContain('Восстановлен черновик');
    expect((document.querySelector('input[inputmode="decimal"]') as HTMLInputElement).value).toBe('500');
  });

  it('окно без клиента (кнопка вверху) — черновик с клиентом восстанавливается, как раньше', async () => {
    drafts.set('payment', { value: { who: 'c2', amount: '', period: 'Октябрь 2026', method: 'bank', date: '22.10.2026' }, savedAt: Date.now() });
    render(<PaymentDialog open clientId={null} onClose={() => undefined} />);
    await flush();
    expect(document.body.textContent).toContain('Петренко Олена');
    expect(document.body.textContent).toContain('Восстановлен черновик');
  });
});
