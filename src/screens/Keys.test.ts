import { describe, expect, it } from 'vitest';
import { noKeyText } from './Other';

describe('«Ключи»: даты ключа нет (приёмка С-8)', () => {
  it('банк / АЦСК указан — «срок ключа не указан»; нет и его — «ключа нет в таблице»', () => {
    expect(noKeyText({ keyIssuer: 'ПриватБанк' })).toBe('срок ключа не указан');
    expect(noKeyText({ keyIssuer: '  ' })).toBe('ключа нет в таблице');
    expect(noKeyText({ keyIssuer: '' })).toBe('ключа нет в таблице');
  });
});
