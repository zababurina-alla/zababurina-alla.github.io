import { describe, expect, it } from 'vitest';
import { CLIENTS } from '../data/fake';
import { search } from './search';

// Корпус «как мама ищет → какой клиент должен найтись первым и единственным (или среди найденных)».
// Клиенты — выдуманные из data/fake.ts. Новый промах — сюда (правило владельца: корпус растёт с ошибкой).
const items = CLIENTS.map((c) => ({ id: c.id, name: c.name, extra: [...c.kved.map((k) => k.code), c.phone] }));

const CORPUS: [string, string][] = [
  ['ромашко', 'c1'],
  ['Ромашко', 'c1'],
  ['ромашк', 'c1'],
  ['ромашке', 'c1'],
  ['ромашкой', 'c1'],
  ['hjvfirj', 'c1'],
  ['вербицкий', 'c2'],
  ['вербицького', 'c2'],
  ['вербицкого', 'c2'],
  ['Вербицкому', 'c2'],
  ['калиновская', 'c3'],
  ['калиновської', 'c3'],
  ['калиновськой', 'c3'],
  ['чайка', 'c4'],
  ['чайки', 'c4'],
  ['ясенко', 'c5'],
  ['ясенку', 'c5'],
  ['соловей', 'c6'],
  ['соловья', 'c6'],
  ['лелеке', 'c7'],
  ['лелека надия', 'c7'],
  ['осокор', 'c8'],
  ['осокору', 'c8'],
  ['шевчук галина', 'c9'],
  ['шевчук галини', 'c9'],
  ['бриз', 'c10'],
  ['дубовик', 'c11'],
  ['дубовика', 'c11'],
  ['мирошниченко', 'c12'],
  ['мирошніченко', 'c12'],
  ['47.91', 'c5'],
  ['96.02', 'c1'],
  ['ольга', 'c12'],
  ['ірина', 'c3'],
  ['ирина', 'c3'],
  ['ирины', 'c3'],
  ['dth,bwrbq', 'c2'],
];

describe('поиск клиента: корпус', () => {
  const results = CORPUS.map(([q, want]) => {
    const found = search(items, q).map((x) => x.id);
    return { q, want, found, ok: found.includes(want) && found.length <= 2 };
  });
  const right = results.filter((r) => r.ok).length;
  it(`верно ${right} из ${CORPUS.length}`, () => {
    console.log(`Поиск клиента: верно ${right} из ${CORPUS.length}`);
    expect(results.filter((r) => !r.ok)).toEqual([]);
  });
});
