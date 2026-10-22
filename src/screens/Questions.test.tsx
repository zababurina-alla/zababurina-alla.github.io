// «Вопросы», флаг answerReplace. Без флага — после 10 с «Ответ уже в таблице — исправить можно в таблице», как было.
// С флагом — «Ответ уже записан» + «Изменить»: вопрос показан снова (варианты или поле с прежним ответом), повторный
// ответ уходит как замена (answerQuestion(id, text, onSaved, true) → questions.answer { replace: true }).
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Question } from '../data/types';
import type { ToastInput } from '../ui/toast';

const mk = (id: string, type: Question['type'], options: string[]): Question =>
  ({ id, version: 1, text: `Вопрос ${id}`, type, options, clientId: 'C-1', status: 'asked', askedAt: '2026-10-22T09:00', answer: null });

const flags = { answerReplace: true };
const toasts: ToastInput[] = [];
let questions: Question[] = [];
let undoOk = false;
const answerQuestion = vi.fn((id: string, _text: string, _onSaved?: () => void, replace?: boolean) => {
  if (!replace) questions = questions.filter((q) => q.id !== id); // как store: отвеченный уходит из списка сразу
  return 'rid-1';
});
const undoHeld = vi.fn(async () => undoOk);

vi.mock('../config', async (orig) => ({
  ...(await orig<typeof import('../config')>()),
  hasFeature: (f: string) => (f === 'answerReplace' ? flags.answerReplace : true),
  canWrite: () => true,
}));
vi.mock('../data/store', () => ({
  HOLD_MS: 10_000,
  useStore: () => ({ get questions() { return questions; }, pending: [], client: () => undefined, answerQuestion, undoHeld }),
}));
vi.mock('../ui/toast', () => ({ useToast: () => (t: ToastInput) => { toasts.push(t); } }));

// jsdom без matchMedia, а модули интерфейса спрашивают его при загрузке.
window.matchMedia ??= ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;

const { QuestionsPanel } = await import('./Questions');
const { resetAnswered } = await import('../ui/answered');

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  flags.answerReplace = true; toasts.length = 0; undoOk = false; answerQuestion.mockClear(); undoHeld.mockClear();
  questions = [mk('Q1', 'choice', ['Да', 'Нет']), mk('Q2', 'text', [])];
  act(() => { resetAnswered(); });
});

let host: HTMLDivElement;
let unmount: () => void;
let rerender: () => void; // моки store не перерисовывают сами — как setState в настоящем
afterEach(() => { unmount(); host.remove(); });

function render() {
  host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  unmount = () => act(() => root.unmount());
  rerender = () => act(() => { root.render(<QuestionsPanel />); });
  act(() => { root.render(<QuestionsPanel />); });
  return host;
}
const click = (b: Element | null | undefined) => act(() => { (b as HTMLElement).click(); });
const btn = (el: HTMLElement, label: string) => [...el.querySelectorAll('button')].find((b) => b.textContent === label);
const last = () => toasts[toasts.length - 1] as ToastInput;
const flush = () => act(async () => { await Promise.resolve(); });
const call = (i: number) => answerQuestion.mock.calls[i] as unknown as [string, string, () => void, boolean | undefined];

function typeInto(el: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => { set?.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
}

/** Ответить «Да» на Q1 и дождаться, пока 10 с «Отменить» уже не помогут (undoHeld → false). */
async function answerAndLateUndo(el: HTMLElement) {
  click(btn(el, 'Да'));
  rerender();
  const hold = last();
  expect(hold.action?.label).toBe('Отменить');
  act(() => { hold.action?.run(); });
  await flush();
}

describe('вопросы: изменить записанный ответ', () => {
  it('без флага: после срока «Отменить» — «исправить можно в таблице», кнопки «Изменить» нет', async () => {
    flags.answerReplace = false;
    const el = render();
    await answerAndLateUndo(el);
    expect(call(0).slice(0, 2)).toEqual(['Q1', 'Да']);
    expect(call(0)[3]).toBeUndefined();
    expect(last().text).toBe('Ответ уже в таблице — исправить можно в таблице');
    expect(last().action).toBeUndefined();
    act(() => { call(0)[2](); });
    expect(last().text).toBe('Ответ «Да» записан в таблицу');
    expect(last().action).toBeUndefined();
  });

  it('с флагом: «Ответ уже записан» + «Изменить»; «Изменить» снова показывает вопрос с вариантами', async () => {
    const el = render();
    await answerAndLateUndo(el);
    expect(last()).toMatchObject({ text: 'Ответ уже записан', action: { label: 'Изменить' } });
    expect(el.textContent).not.toContain('Вопрос Q1');
    act(() => { last().action?.run(); });
    expect(el.textContent).toContain('Вопрос Q1');
    expect(el.textContent).toContain('Записано: «Да»');
    expect([...el.querySelectorAll('.question--edit button')].map((b) => b.textContent)).toEqual(['Да', 'Нет', 'Не менять']);
    expect(btn(el, 'Да')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('повторный ответ уходит как замена: answerQuestion(id, текст, onSaved, true); после записи форма закрывается', async () => {
    const el = render();
    await answerAndLateUndo(el);
    act(() => { last().action?.run(); });
    click(btn(el, 'Нет'));
    expect(call(1).slice(0, 2)).toEqual(['Q1', 'Нет']);
    expect(call(1)[3]).toBe(true);
    expect(el.textContent).toContain('Вопрос Q1'); // пока не записано — форма на месте
    act(() => { call(1)[2](); });
    expect(last()).toMatchObject({ text: 'Ответ изменён: «Нет»', action: { label: 'Изменить' } });
    expect(el.textContent).not.toContain('Записано: «Да»');
    // ещё раз изменить можно — вопрос помнит новый ответ
    act(() => { last().action?.run(); });
    expect(el.textContent).toContain('Записано: «Нет»');
  });

  it('тот же ответ не отправляется; «Не менять» закрывает форму', async () => {
    const el = render();
    await answerAndLateUndo(el);
    act(() => { last().action?.run(); });
    click(btn(el, 'Да'));
    expect(answerQuestion).toHaveBeenCalledTimes(1);
    expect(el.textContent).not.toContain('Записано: «Да»');
    act(() => { last().action?.run(); });
    expect(el.textContent).toContain('Записано: «Да»');
    click(btn(el, 'Не менять'));
    expect(el.textContent).not.toContain('Записано: «Да»');
  });

  it('текстовый вопрос: поле с прежним ответом, кнопка «Изменить», в запросе замена', async () => {
    const el = render();
    typeInto(el.querySelectorAll('input')[0] as HTMLInputElement, 'Первый');
    click(btn(el, 'Ответить'));
    act(() => { last().action?.run(); });
    await flush();
    act(() => { last().action?.run(); });
    const input = el.querySelector('.question--edit input') as HTMLInputElement;
    expect(input.value).toBe('Первый');
    typeInto(input, 'Второй');
    click(btn(el, 'Изменить'));
    expect(call(1).slice(0, 2)).toEqual(['Q2', 'Второй']);
    expect(call(1)[3]).toBe(true);
  });

  it('отмена вовремя: вопрос снова в списке, «Изменить» не предлагается', async () => {
    undoOk = true;
    const el = render();
    click(btn(el, 'Да'));
    act(() => { last().action?.run(); });
    await flush();
    expect(last()).toMatchObject({ text: 'Ответ отменён — вопрос снова в списке' });
    expect(last().action).toBeUndefined();
  });
});
