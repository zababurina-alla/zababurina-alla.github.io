import { describe, expect, it } from 'vitest';
import { CLIENTS } from '../data/fake';
import { search } from './search';
import { splitFieldQuery } from './fieldQuery';
import type { ClientField } from './fieldQuery';

// Корпус «как мама ищет поле клиента → имя и поле». Первый — из находки «Пользователя» № 11 (16.10.2026).
// Новый промах — сюда (правило владельца: корпус растёт с ошибкой).
const CORPUS: [string, string, ClientField | null][] = [
  ['ромашко ключ', 'ромашко', 'key'],
  ['ключ ромашко', 'ромашко', 'key'],
  ['ромашко ключа', 'ромашко', 'key'],
  ['ключ ЕЦП ромашко', 'ромашко', 'key'],
  ['ромашко эцп', 'ромашко', 'key'],
  ['вербицкий КЕП', 'вербицкий', 'key'],
  ['підпис ясенко', 'ясенко', 'key'],
  ['телефон вербицкого', 'вербицкого', 'phone'],
  ['вербицкий тел', 'вербицкий', 'phone'],
  ['номер чайки', 'чайки', 'phone'],
  ['соловей мобильный', 'соловей', 'phone'],
  ['пароль калиновской', 'калиновской', 'password'],
  ['калиновська пароля', 'калиновська', 'password'],
  ['ясенко кабинет', 'ясенко', 'password'],
  ['квед лелеки', 'лелеки', 'kved'],
  ['осокор КВЕДи', 'осокор', 'kved'],
  ['почта дубовика', 'дубовика', 'email'],
  ['мирошниченко пошта', 'мирошниченко', 'email'],
  ['шевчук галина ключ', 'шевчук галина', 'key'],
  ['email бриз', 'бриз', 'email'],
  // Без поля: одно слово, фамилии, похожие на слова полей, обычные запросы
  ['ключ', 'ключ', null],
  ['ромашко', 'ромашко', null],
  ['тельнова', 'тельнова', null],
  ['ключенко олег', 'ключенко олег', null],
  ['ромашко єсв', 'ромашко єсв', null],
  ['шевчук галина', 'шевчук галина', null],
];

describe('фамилия + поле: корпус', () => {
  const results = CORPUS.map(([q, name, field]) => {
    const got = splitFieldQuery(q);
    return { q, want: `${name}|${field}`, got: `${got.name}|${got.field}` };
  });
  const right = results.filter((r) => r.want === r.got).length;
  it(`верно ${right} из ${CORPUS.length}`, () => {
    console.log(`Фамилия + поле: верно ${right} из ${CORPUS.length}`);
    expect(results.filter((r) => r.want !== r.got)).toEqual([]);
  });

  it('«ромашко ключ» находит клиента по имени (раньше — ничего)', () => {
    const items = CLIENTS.map((c) => ({ id: c.id, name: c.name }));
    expect(search(items, 'ромашко ключ').map((x) => x.id)).toEqual([]);
    const { name } = splitFieldQuery('ромашко ключ');
    expect(search(items, name).map((x) => x.id)).toEqual(['c1']);
  });
});
