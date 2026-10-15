// Поиск КВЕД по всему листу «📑 КВЕДы» в браузере (reference.kved { all:true }, ~217 строк): мгновенно, без 5 с
// на каждый запрос. Запрос сначала приводится к виду листа (lib/kvedQuery). Код ищется по началу; нет такого —
// укорачиваем, как сервер: «56.30» → «56.3» → «56» и говорим, что точного нет. Слова — по названию (fold).
// Это читалка: корпус «запрос → коды» — в kvedLocal.test.ts.
import { kvedQuery } from './kvedQuery';
import { fold } from './search';

export interface KvedRow { code: string; title: string }
export interface KvedHit<T extends KvedRow> { items: T[]; note: string | null }

const LIMIT = 20;

// «45.20» и «45.2» — один код: в листе ноль в конце не пишут.
const bare = (c: string) => (c.includes('.') ? c.replace(/0+$/, '').replace(/\.$/, '') : c);
// Основа слова: «оренда» найдёт «оренду», «перукар» — «перукарнями» (без последних двух букв, не короче 4).
const stem = (w: string) => w.slice(0, Math.max(4, w.length - 2));

export function searchKved<T extends KvedRow>(all: T[], raw: string): KvedHit<T> {
  const q = kvedQuery(raw);
  if (/^\d/.test(q)) {
    const want = bare(q);
    for (let c = want; c.length >= 2; c = c.slice(0, -1).replace(/\.$/, '')) {
      const items = all.filter((k) => { const b = bare(k.code); return b === c || b.startsWith(`${c}.`) || (c.includes('.') && b.startsWith(c)); });
      if (items.length) {
        return { items: items.slice(0, LIMIT), note: c === want ? null : `Кода ${q} в листе нет — показаны ближайшие (${c})` };
      }
    }
    return { items: [], note: `Кода ${q} в листе КВЕДов нет — ставка для него не установлена радою` };
  }
  const words = fold(q).split(' ').filter(Boolean).map(stem);
  const items = all.filter((k) => { const t = fold(k.title); return words.every((w) => t.includes(w)); });
  return { items: items.slice(0, LIMIT), note: null };
}
