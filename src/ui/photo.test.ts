import { describe, expect, it } from 'vitest';
import type { Client } from '../data/types';
import { clientPhoto, safePhoto, setPhotos } from './photo';

const withPhoto = (photoUrl: unknown) => ({ id: 'X', photoUrl }) as unknown as Client;
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';

describe('фото клиента для аватара', () => {
  it('нет поля или клиента — буквы (null)', () => {
    setPhotos({});
    expect(clientPhoto(undefined)).toBeNull();
    expect(clientPhoto({ id: 'C-1' } as Client)).toBeNull();
  });
  it('https-адрес и data:image jpeg/png/webp; svg, http, javascript, битый base64, слишком большое — нет', () => {
    expect(clientPhoto(withPhoto('https://cdn.example/p.jpg'))).toBe('https://cdn.example/p.jpg');
    expect([safePhoto(JPG), safePhoto('data:image/png;base64,iVBORw0KGgo='), safePhoto('data:image/webp;base64,UklGRg==')].every(Boolean)).toBe(true);
    expect([
      safePhoto('http://cdn.example/p.jpg'), safePhoto('javascript:alert(1)'), safePhoto(''),
      safePhoto('data:image/svg+xml;base64,PHN2Zz4='), safePhoto('data:image/jpeg;base64,<script>'), safePhoto(`data:image/jpeg;base64,${'A'.repeat(400_001)}`),
    ]).toEqual([null, null, null, null, null, null]);
  });
  it('фото с сервера (clients.photos) — по id клиента; плохие отбрасываются; выход очищает', () => {
    setPhotos({ 'C-1': JPG, 'C-2': 'data:image/svg+xml;base64,PHN2Zz4=' });
    expect([clientPhoto({ id: 'C-1' } as Client), clientPhoto({ id: 'C-2' } as Client)]).toEqual([JPG, null]);
    setPhotos({});
    expect(clientPhoto({ id: 'C-1' } as Client)).toBeNull();
  });
});
