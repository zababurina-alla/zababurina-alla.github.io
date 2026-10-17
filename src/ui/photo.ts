// Фото клиента для аватара (владелец 17.10: фото из Telegram вместо букв). Источник — clients.photos (флаг photos):
// сервер отдаёт data:image/… для текущих клиентов; store кладёт их сюда через setPhotos. Только в памяти вкладки —
// это личные данные клиентов: в localStorage / IndexedDB не пишем. Нет фото — null, и аватар остаётся буквами.
import type { Client } from '../data/types';

/** Картинка, которую пропускаем на экран: https-адрес или data:image/jpeg|png|webp в base64 до ~300 КБ (без svg —
 *  в нём бывает разметка со скриптом). Всё прочее — null (буквы). */
const DATA_IMG = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const MAX_DATA = 400_000; // символов base64 ≈ 300 КБ

export function safePhoto(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  if (/^https:\/\//i.test(v)) return v;
  return v.length <= MAX_DATA && DATA_IMG.test(v) ? v : null;
}

let map: Readonly<Record<string, string>> = {};

/** Новый набор фото (store, после clients.photos). Плохие значения отбрасываются. */
export function setPhotos(next: Record<string, string>): Readonly<Record<string, string>> {
  const clean: Record<string, string> = {};
  for (const [id, v] of Object.entries(next)) { const ok = safePhoto(v); if (ok) clean[id] = ok; }
  map = clean;
  return map;
}

export function clientPhoto(c: Client | null | undefined): string | null {
  if (!c) return null;
  return map[c.id] ?? safePhoto((c as { photoUrl?: unknown }).photoUrl);
}
