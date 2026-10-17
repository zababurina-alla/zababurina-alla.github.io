import { describe, expect, it } from 'vitest';
import { keepNumbers } from './numbers';

const NB = '\u00A0';

describe('числа в тексте клиента не рвутся', () => {
  it('«1 902,34» и «12 500» — пробел между разрядами неразрывный', () => {
    expect(keepNumbers('Оплатила ЄСВ за вересень, 1 902,34')).toBe(`Оплатила ЄСВ за вересень, 1${NB}902,34`);
    expect(keepNumbers('сума 12 500 грн')).toBe(`сума 12${NB}500 грн`);
    expect(keepNumbers('1 234 567')).toBe(`1${NB}234${NB}567`);
  });
  it('обычные слова и числа не трогает', () => {
    expect(keepNumbers('за 2025 рік, 3 квартал')).toBe('за 2025 рік, 3 квартал');
    expect(keepNumbers('Добрий день')).toBe('Добрий день');
  });
});
