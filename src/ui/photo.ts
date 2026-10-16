// Фото клиента для аватара (владелец 17.10: фото из Telegram вместо букв; достанет «Читалка», поле добавит техника).
// Пока у клиента нет photoUrl — null, и аватар остаётся буквами. Берём только https-адрес картинки.
import type { Client } from '../data/types';

export function clientPhoto(c: Client | null | undefined): string | null {
  const v = (c as { photoUrl?: unknown } | null | undefined)?.photoUrl;
  return typeof v === 'string' && /^https:\/\//i.test(v) ? v : null;
}
