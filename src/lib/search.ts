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

export function search<T extends Searchable>(items: T[], query: string): T[] {
  return items.filter((it) => matches(it, query));
}
