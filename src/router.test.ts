import { describe, expect, it } from 'vitest';
import { parseHash, toHash } from './router';

describe('parseHash', () => {
  it('пустой адрес открывает «Сегодня»', () => {
    expect(parseHash('')).toEqual({ name: 'today', params: [] });
    expect(parseHash('#/')).toEqual({ name: 'today', params: [] });
  });
  it('незнакомый экран открывает «Сегодня»', () => {
    expect(parseHash('#/nope')).toEqual({ name: 'today', params: [] });
  });
  it('экран с параметром', () => {
    expect(parseHash('#/clients/42')).toEqual({ name: 'clients', params: ['42'] });
  });
  it('туда и обратно без потерь, включая кириллицу', () => {
    const route = { name: 'clients' as const, params: ['Іваненко'] };
    expect(parseHash(toHash(route))).toEqual(route);
  });
});
