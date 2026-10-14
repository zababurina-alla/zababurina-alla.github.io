// Даты: внутри — ISO «2026-10-14», на экране — «14.10.2026» (стиль таблиц, п. 5).
import type { Status } from '../data/types';
import { isLive } from '../config';

/** Сегодня по Киеву (часовой пояс таблицы), независимо от пояса компьютера. */
export function kyivToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** «Сегодня»: на живых данных — по Киеву; на выдуманных — 14.10.2026, под них написаны данные и корпуса. */
export const TODAY = isLive() ? kyivToday() : '2026-10-14';

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_DAT = ['январю', 'февралю', 'марту', 'апрелю', 'маю', 'июню', 'июлю', 'августу', 'сентябрю', 'октябрю', 'ноябрю', 'декабрю'];
const MONTHS_PREP = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number);
  return [y ?? 1970, m ?? 1, d ?? 1];
}

export function toUtc(iso: string): number {
  const [y, m, d] = parts(iso);
  return Date.UTC(y, m - 1, d);
}

export function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  return fromUtc(toUtc(iso) + n * 86_400_000);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((toUtc(toIso) - toUtc(fromIso)) / 86_400_000);
}

export function fmtDate(iso: string): string {
  const [y, m, d] = parts(iso);
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
}

/** «2026-10» — ключ месяца для фильтра платежей. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** Ключ прошлого месяца: «2026-10» → «2026-09», «2026-01» → «2025-12». */
export function prevMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number);
  const yy = m === 1 ? (y ?? 1970) - 1 : (y ?? 1970);
  const mm = m === 1 ? 12 : (m ?? 1) - 1;
  return `${yy}-${String(mm).padStart(2, '0')}`;
}

/** Месяц словами: nom — «Октябрь», prep — «октябре» (в октябре), gen — «октября», dat — «октябрю» (к октябрю). */
export function monthName(key: string, form: 'nom' | 'prep' | 'gen' | 'dat'): string {
  const m = Number(key.slice(5, 7)) - 1;
  const table = { nom: MONTHS_NOM, prep: MONTHS_PREP, gen: MONTHS_GEN, dat: MONTHS_DAT }[form];
  return table[m] ?? '';
}

export function daysInMonth(key: string): number {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, m ?? 1, 0)).getUTCDate();
}

/** Дата срока на экран; null — «без даты». */
export function fmtDue(iso: string | null): string {
  return iso ? fmtDate(iso) : 'без даты';
}

export function fmtDayMonth(iso: string): string {
  const [, m, d] = parts(iso);
  return `${d} ${MONTHS_GEN[m - 1]}`;
}

export function fmtShort(iso: string): string {
  const [, m, d] = parts(iso);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

export function weekday(iso: string): string {
  return WEEKDAYS[new Date(toUtc(iso)).getUTCDay()] ?? '';
}

export function endOfMonth(iso: string): string {
  const [y, m] = parts(iso);
  return fromUtc(Date.UTC(y, m, 0));
}

/** Пороги — эталон таблиц, п. 10: 🔴 < 0; 🟠 0–7; 🟡 8–30; 🟢 > 30. */
export function statusByDays(days: number): Status {
  if (days < 0) return 'red';
  if (days <= 7) return 'orange';
  if (days <= 30) return 'yellow';
  return 'green';
}

export function daysLabel(days: number): string {
  if (days < -1) return `просрочено ${-days} дн.`;
  if (days === -1) return 'просрочено вчера';
  if (days === 0) return 'сегодня';
  if (days === 1) return 'завтра';
  return `через ${days} дн.`;
}

/** Русское согласование с числом: 1 срок, 2 срока, 5 сроков. */
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = Math.abs(n) % 10;
  const m100 = Math.abs(n) % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

// ── Разбор даты, которую ввела мама. Это читалка: корпус и «верно N из M» — в dates.test.ts.
const MONTH_WORDS: [RegExp, number][] = [
  [/^(янв|січ)/, 1], [/^(фев|лют)/, 2], [/^(мар|бер)/, 3], [/^(апр|кві)/, 4], [/^(мая|май|тра)/, 5], [/^(июн|чер)/, 6],
  [/^(июл|лип)/, 7], [/^(авг|сер)/, 8], [/^(сен|вер)/, 9], [/^(окт|жов)/, 10], [/^(ноя|лис)/, 11], [/^(дек|гру)/, 12],
];

function valid(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1) return null;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > last) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** «14.10.2026», «14.10.26», «14/10», «2026-10-14», «14 окт», «14 жовтня», «сегодня», «завтра», «вчера» → ISO или null. */
export function parseUserDate(input: string, today = TODAY): string | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, ' ').replace(/г\.?$|р\.?$/, '').trim();
  if (!s) return null;
  if (/^(сегодня|сьогодні)$/.test(s)) return today;
  if (/^(завтра)$/.test(s)) return addDays(today, 1);
  if (/^(вчера|вчора)$/.test(s)) return addDays(today, -1);
  const [ty] = parts(today);
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) return valid(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const num = /^(\d{1,2})[./\-\s](\d{1,2})(?:[./\-\s](\d{2}|\d{4}))?$/.exec(s);
  if (num) {
    const y = num[3] ? (num[3].length === 2 ? 2000 + Number(num[3]) : Number(num[3])) : ty;
    return valid(y, Number(num[2]), Number(num[1]));
  }
  const word = /^(\d{1,2}) ([а-яіїєґ]+)\.?(?: (\d{4}))?$/.exec(s);
  if (word?.[2]) {
    const m = MONTH_WORDS.find(([re]) => re.test(word[2] ?? ''))?.[1];
    if (!m) return null;
    return valid(word[3] ? Number(word[3]) : ty, m, Number(word[1]));
  }
  return null;
}
