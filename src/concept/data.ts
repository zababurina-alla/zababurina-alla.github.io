// Выдуманные данные для макетов. Ни один клиент не взят из таблицы; совпадения фамилий случайны.
// Сегодня в макете — 14.10.2026 (среда).

export type Status = 'red' | 'orange' | 'yellow' | 'green' | 'grey';

export interface Deadline {
  id: string;
  client: string;
  what: string;
  due: string; // дд.мм.гггг
  daysLeft: number;
  amount?: string;
  /** Отчётный период ещё не закончился — закрыть нельзя (проверка и в интерфейсе, и на сервере). */
  periodOpen?: boolean;
}

// Пороги дней — эталон таблиц, п. 10: 🔴 < 0; 🟠 0–7; 🟡 8–30; 🟢 > 30.
export function statusByDays(days: number): Status {
  if (days < 0) return 'red';
  if (days <= 7) return 'orange';
  if (days <= 30) return 'yellow';
  return 'green';
}

export function daysLabel(days: number): string {
  if (days < 0) return `просрочено ${-days} дн.`;
  if (days === 0) return 'сегодня';
  if (days === 1) return 'завтра';
  return `через ${days} дн.`;
}

export const DEADLINES: Deadline[] = [
  { id: 'd1', client: 'Соловей Тетяна', what: 'ЄП за сентябрь, 2 группа', due: '20.09.2026', daysLeft: -24, amount: '1 729,40 ₴' },
  { id: 'd2', client: 'Лелека Надія', what: 'ЄСВ за III квартал', due: '12.10.2026', daysLeft: -2, amount: '5 707,02 ₴' },
  { id: 'd3', client: 'Ромашко Олена', what: 'ЄСВ за III квартал', due: '20.10.2026', daysLeft: 6, amount: '5 707,02 ₴' },
  { id: 'd4', client: 'Калиновська Ірина', what: 'ЄП за октябрь, 1 группа', due: '20.10.2026', daysLeft: 6, amount: '332,80 ₴', periodOpen: true },
  { id: 'd5', client: 'ТОВ «Чайка-Сервіс»', what: 'Податковий розрахунок, III квартал', due: '15.10.2026', daysLeft: 1 },
  { id: 'd6', client: 'Вербицький Андрій', what: 'Декларація платника ЄП, 3 группа, III кв.', due: '09.11.2026', daysLeft: 26 },
  { id: 'd7', client: 'Осокор Віктор', what: 'Декларація платника ЄП, 3 группа, III кв.', due: '09.11.2026', daysLeft: 26 },
];

export interface KeyExpiry {
  client: string;
  until: string;
  daysLeft: number;
}

export const KEYS: KeyExpiry[] = [
  { client: 'Ромашко Олена', until: '19.10.2026', daysLeft: 5 },
  { client: 'Ясенко Микола', until: '26.10.2026', daysLeft: 12 },
];

export const QUESTIONS = [
  { from: 'Дмитрий', text: 'У Ясенко новый КВЕД 47.91 — добавить в карточку?', when: 'вчера, 21:40' },
];

export interface Client {
  id: string;
  name: string;
  kind: string;
  kved: string[];
  phone: string;
  keyUntil: string;
  keyDays: number;
  taxes: { name: string; amount: string; note: string }[];
}

export const CLIENTS: Client[] = [
  {
    id: 'c1',
    name: 'Ромашко Олена Петрівна',
    kind: 'ФОП, 2 группа',
    kved: ['96.02 Надання послуг перукарнями та салонами краси'],
    phone: '+380 00 000 00 01',
    keyUntil: '19.10.2026',
    keyDays: 5,
    // Расчёт по ставкам 2026 из бриф: МЗП 8 647, ЄСВ 22 % МЗП = 1 902,34. Ставка ЄП 20 % МЗП — для макета.
    taxes: [
      { name: 'ЄП', amount: '1 729,40 ₴', note: 'в месяц, 20 % МЗП' },
      { name: 'ЄСВ', amount: '1 902,34 ₴', note: 'в месяц, 22 % МЗП' },
      { name: 'ВЗ', amount: '864,70 ₴', note: 'в месяц, 10 % МЗП' },
    ],
  },
  { id: 'c2', name: 'Вербицький Андрій Олегович', kind: 'ФОП, 3 группа, 5 %', kved: ['62.01'], phone: '', keyUntil: '03.03.2027', keyDays: 140, taxes: [] },
  { id: 'c3', name: 'Калиновська Ірина Василівна', kind: 'ФОП, 1 группа', kved: ['47.89'], phone: '', keyUntil: '11.01.2027', keyDays: 89, taxes: [] },
  { id: 'c4', name: 'ТОВ «Чайка-Сервіс»', kind: 'ТОВ, общая система, работодатель', kved: ['52.29'], phone: '', keyUntil: '30.11.2026', keyDays: 47, taxes: [] },
  { id: 'c5', name: 'Ясенко Микола Іванович', kind: 'ФОП, 3 группа, 5 %', kved: ['47.91'], phone: '', keyUntil: '26.10.2026', keyDays: 12, taxes: [] },
  { id: 'c6', name: 'Соловей Тетяна Андріївна', kind: 'ФОП, 2 группа', kved: ['56.10'], phone: '', keyUntil: '08.08.2027', keyDays: 298, taxes: [] },
  { id: 'c7', name: 'Лелека Надія Степанівна', kind: 'ФОП, 1 группа', kved: ['47.81'], phone: '', keyUntil: '—', keyDays: 999, taxes: [] },
];

export const PAYMENTS = [
  { client: 'Ромашко Олена', what: 'за октябрь', amount: '1 500,00 ₴', when: '14.10.2026', how: 'на счёт' },
  { client: 'Вербицький Андрій', what: 'за III квартал', amount: '4 200,00 ₴', when: '13.10.2026', how: 'наличными' },
];
