import { describe, expect, it } from 'vitest';
import type { Client } from '../data/types';
import { clientPhoto } from './photo';

const withPhoto = (photoUrl: unknown) => ({ photoUrl }) as unknown as Client;

describe('фото клиента для аватара', () => {
  it('нет поля или клиента — буквы (null)', () => {
    expect(clientPhoto(undefined)).toBeNull();
    expect(clientPhoto({} as Client)).toBeNull();
  });
  it('только https-адрес', () => {
    expect(clientPhoto(withPhoto('https://cdn.example/p.jpg'))).toBe('https://cdn.example/p.jpg');
    expect(clientPhoto(withPhoto('http://cdn.example/p.jpg'))).toBeNull();
    expect(clientPhoto(withPhoto('javascript:alert(1)'))).toBeNull();
    expect(clientPhoto(withPhoto(''))).toBeNull();
  });
});
