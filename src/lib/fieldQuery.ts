// «ромашко ключ», «телефон вербицкого»: фамилия + слово о поле карточки (находка «Пользователя» № 11).
// Это читалка: корпус «запрос → имя + поле» и число «верно N из M» — в fieldQuery.test.ts.
import { fold } from './search';

export type ClientField = 'key' | 'phone' | 'password' | 'kved' | 'email';

// Слова, сведённые fold (є→е, і→и, э→е). Короткие (до 3 букв) — только целым словом: «тел» не должно ловить «Тельнову».
const FIELD_WORDS: [ClientField, string[]][] = [
  ['key', ['ключ', 'ключи', 'ецп', 'кеп', 'ецп-ключ', 'подпис', 'пидпис']],
  ['phone', ['телефон', 'тел', 'номер', 'мобилн', 'мобильн']],
  ['password', ['пароль', 'парол', 'кабинет']],
  ['kved', ['квед', 'кведы', 'кведи']],
  ['email', ['почта', 'пошта', 'почту', 'пошту', 'email', 'e-mail', 'имеил', 'емеил', 'мейл']],
];

function fieldOf(word: string): ClientField | null {
  for (const [field, words] of FIELD_WORDS) {
    for (const k of words) {
      if (word === k) return field;
      // «ключа», «телефона», «пароля», «подписи», «мобильный»: основа от 4 букв и окончание до 3 букв.
      if (k.length >= 4 && word.startsWith(k) && word.length - k.length <= 3) return field;
    }
  }
  return null;
}

/** Разделить запрос на имя и поле. Поле — только если рядом есть имя: одно «ключ» ищется как обычно. */
export function splitFieldQuery(query: string): { name: string; field: ClientField | null } {
  const words = fold(query).split(' ').filter(Boolean);
  if (words.length < 2) return { name: query.trim(), field: null };
  const raw = query.trim().split(/\s+/);
  let field: ClientField | null = null;
  const rest: string[] = [];
  words.forEach((w, i) => {
    // Все слова полей убираем («ключ ЕЦП ромашко» → «ромашко»), поле — по первому.
    const f = fieldOf(w);
    if (f) field ??= f; else rest.push(raw[i] ?? w);
  });
  return field && rest.length ? { name: rest.join(' '), field } : { name: query.trim(), field: null };
}
