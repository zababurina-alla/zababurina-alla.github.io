// Поиск клиента: любой падеж, русские и украинские буквы, ошибка раскладки (бриф, п. 3).
// Это читалка: корпус «запрос → клиент» и число «верно N из M» — в search.test.ts.

const LAT_TO_CYR: Record<string, string> = {
  q: 'й', w: 'ц', e: 'у', r: 'к', t: 'е', y: 'н', u: 'г', i: 'ш', o: 'щ', p: 'з', '[': 'х', ']': 'ъ',
  a: 'ф', s: 'ы', d: 'в', f: 'а', g: 'п', h: 'р', j: 'о', k: 'л', l: 'д', ';': 'ж', "'": 'э',
  z: 'я', x: 'ч', c: 'с', v: 'м', b: 'и', n: 'т', m: 'ь', ',': 'б', '.': 'ю', '`': 'ё',
};

/** Сводим русские и украинские буквы к одному виду, убираем мягкие знаки и апострофы. */
export function fold(s: string): string {
  return s.toLowerCase()
    .replace(/[ʼ’'`"«»]/g, '')
    .replace(/ё/g, 'е').replace(/є/g, 'е').replace(/э/g, 'е')
    .replace(/[іїы]/g, 'и').replace(/й/g, 'и')
    .replace(/ґ/g, 'г')
    .replace(/[ьъ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Набрано латиницей на русской раскладке: «hjvfirj» → «ромашко». */
export function fromLatinLayout(s: string): string {
  return s.toLowerCase().split('').map((ch) => LAT_TO_CYR[ch] ?? ch).join('');
}

// Окончания падежей (рус./укр.), которые отрезаем от слова запроса: «Ромашко-й», «Вербицкого», «Ірини».
const ENDINGS = ['ого', 'ому', 'ими', 'ой', 'ою', 'ей', 'ем', 'ам', 'ах', 'ом', 'ов', 'ин', 'ии', 'ию', 'ия', 'ие',
  'а', 'у', 'е', 'и', 'ю', 'я', 'о', 'ы'];

function stem(word: string): string {
  if (word.length <= 4) return word;
  for (const e of ENDINGS) {
    const f = fold(e);
    if (word.endsWith(f) && word.length - f.length >= 4) return word.slice(0, -f.length);
  }
  return word;
}

// Мужские фамилии на -ский/-цкий в рус. падежах теряют «и»: «Вербицкого» → «вербицк», в укр. «Вербицький» → «вербицки».
function stemSurname(word: string): string {
  return stem(word).replace(/(ск|цк)и$/, '$1');
}

export interface Searchable {
  id: string;
  name: string;
  extra?: string[]; // ІПН, КВЕД, телефон
  /** Второй уровень: название КВЕД, где выпущен ключ, тексты сроков — ищется, только если по имени ничего нет. */
  words?: string[];
}

/** Подходит ли запись под запрос: каждое слово запроса — начало какого-то слова записи (после сведения букв и основы). */
export function matches(item: Searchable, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  const variants = /[a-z]/i.test(q) ? [q, fromLatinLayout(q)] : [q];
  const hayWords = fold(item.name).split(' ').map(stemSurname);
  const extra = (item.extra ?? []).map((x) => x.replace(/\s/g, ''));
  return variants.some((v) => {
    const words = fold(v).split(' ').filter(Boolean);
    return words.every((w) => {
      if (/^\d/.test(w)) return extra.some((x) => x.includes(w.replace(/\s/g, '')));
      const sw = stemSurname(w);
      return hayWords.some((h) => h.startsWith(sw) || sw.startsWith(h));
    });
  });
}

// Второй уровень: таблица по-украински, мама пишет и по-русски («программирование» ↔ «програмування»):
// сводим удвоенные буквы и засчитываем слово, если оно начало слова записи или у них общее начало от 6 букв.
function wordForm(word: string): string {
  return stem(fold(word)).replace(/(.)\1/g, '$1');
}

function wordHit(q: string, h: string): boolean {
  if (h.startsWith(q) || (h.length >= 4 && q.startsWith(h))) return true;
  let i = 0;
  while (i < q.length && i < h.length && q[i] === h[i]) i++;
  return i >= 6;
}

/** Сколько слов запроса (от 3 букв, не цифры) нашлось в словах записи второго уровня. */
export function wordHits(item: Searchable, query: string): number {
  const hay = (item.words ?? []).flatMap((t) => fold(t).split(/[\s,.;:()«»—-]+/)).filter((w) => w.length >= 3).map(wordForm);
  if (!hay.length) return 0;
  const words = fold(query).split(' ').filter((w) => w.length >= 3 && !/^\d/.test(w)).map(wordForm);
  return words.filter((w) => hay.some((h) => wordHit(w, h))).length;
}

/** Сначала — по имени, коду и телефону (точно). Ничего не нашлось — по названию КВЕД, банку ключа, текстам сроков,
 *  лучшие совпадения первыми. */
export function search<T extends Searchable>(items: T[], query: string): T[] {
  const direct = items.filter((it) => matches(it, query));
  if (direct.length || !query.trim()) return direct;
  return items.map((it) => ({ it, n: wordHits(it, query) })).filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n).map((x) => x.it);
}
