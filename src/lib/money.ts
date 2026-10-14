// Суммы: храним в копейках (целое число), показываем «1 234,56 ₴».
// Ввод принимает «1234.56», «1 234,56», «1234,5», «1234», «1 234 ₴», «1.234,56» — бриф, п. 4.

const NBSP = String.fromCharCode(0xa0);

export type ParseResult = { ok: true; kopecks: number } | { ok: false; error: string };

/** Разбор того, что ввела мама. Ошибки — простыми словами (бриф, п. 4). */
export function parseMoney(input: string): ParseResult {
  let s = input.trim().replace(/₴|грн\.?|uah/gi, '').replace(/[\s']/g, '');
  if (s === '') return { ok: false, error: 'Введите сумму' };
  if (s.startsWith('-') || s.startsWith('−')) return { ok: false, error: 'Сумма должна быть больше нуля' };
  if (!/^[\d.,]+$/.test(s)) return { ok: false, error: 'В сумме могут быть только цифры, точка или запятая' };

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  const sepAt = Math.max(lastDot, lastComma);
  let whole = s;
  let frac = '';
  if (sepAt >= 0) {
    const tail = s.slice(sepAt + 1);
    const head = s.slice(0, sepAt);
    // «1.234» и «1,234» без копеек — это тысячи, если после знака ровно 3 цифры и знак один на всю строку.
    const onlyOneSep = (s.match(/[.,]/g) ?? []).length === 1;
    // Знак, который встречается несколько раз, — разделитель тысяч («1,234,567»), а не копеек.
    const sepChar = s[sepAt] ?? '';
    const repeated = s.split(sepChar).length - 1 > 1;
    if (repeated) {
      const groups = s.split(/[.,]/);
      const valid = groups.slice(1).every((g) => g.length === 3) && (groups[0]?.length ?? 0) > 0;
      if (!valid) return { ok: false, error: 'Не понял сумму — проверьте точки и запятые' };
      whole = groups.join('');
    } else if (onlyOneSep && tail.length === 3 && head.length > 0) {
      whole = head + tail;
    } else {
      if (tail.length > 2) return { ok: false, error: 'После запятой — не больше двух цифр (копейки)' };
      whole = head.replace(/[.,]/g, '');
      frac = tail;
    }
  }
  s = whole;
  if (!/^\d+$/.test(s || '0')) return { ok: false, error: 'Не понял сумму — проверьте цифры' };
  const kopecks = Number(s || '0') * 100 + Number((frac + '00').slice(0, 2));
  if (!Number.isSafeInteger(kopecks)) return { ok: false, error: 'Слишком большая сумма' };
  if (kopecks === 0) return { ok: false, error: 'Сумма должна быть больше нуля' };
  return { ok: true, kopecks };
}

/** «1 234,56 ₴» — пробелы неразрывные, чтобы сумма не переносилась. */
/** Сумма платежа на экран; null (в таблице пусто или не число) — «сумма не указана». */
export function formatPayMoney(kopecks: number | null): string {
  return kopecks === null ? 'сумма не указана' : formatMoney(kopecks);
}

export function formatMoney(kopecks: number, withSign = true): string {
  const neg = kopecks < 0;
  const abs = Math.abs(Math.round(kopecks));
  const grn = Math.floor(abs / 100);
  const kop = String(abs % 100).padStart(2, '0');
  const grouped = String(grn).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${neg ? '−' : ''}${grouped},${kop}${withSign ? `${NBSP}₴` : ''}`;
}
