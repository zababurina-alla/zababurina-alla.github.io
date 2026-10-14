// Типы данных кабинета — по контракту API v2 (docs/api-contract.md, раздел 7).

export type Status = 'red' | 'orange' | 'yellow' | 'green' | 'grey';

/** Состояние записи относительно таблицы (бриф, п. 6): «сохранено» — только после ответа сервера. */
export type SaveState = 'saving' | 'saved' | 'failed';

/** [п. 15] tov3 и tovGeneral различаются: у них разные шаблоны сроков. */
export type ClientKind = 'fop1' | 'fop2' | 'fop3' | 'fopGeneral' | 'tov3' | 'tovGeneral' | 'person' | 'nonresident';

/** [п. 16] Пометки колонки L. allUkraine — только fop1/fop2; pensioner + employed вместе нельзя. */
export type ClientMark = 'pensioner' | 'employed' | 'allUkraine';

export interface Client {
  id: string;
  version: number;
  name: string;
  kind: ClientKind;
  marks: ClientMark[];
  employer: boolean;
  kved: { code: string; title: string }[];
  phone: string;
  /** [п. 17] Колонка F: банк / АЦСК, где выпущен ключ ЭЦП (одно поле вместо «банк» + «кем выдан»). */
  keyIssuer: string;
  keyFrom?: string | null; // ISO
  keyUntil: string | null; // ISO
  /** Начисления в месяц, копейки; считает сервер. kopecks = null → note — подсказка. */
  monthly: { name: string; kopecks: number | null; note: string }[];
}

export type DeadlineStatus = 'new' | 'inProgress' | 'waiting' | 'postponed' | 'done';

export interface Deadline {
  id: string;
  version: number;
  clientId: string;
  /** Текст обязательства + метка периода («ЄСВ за III квартал»). */
  what: string;
  periodicity: 'once' | 'month' | 'quarter' | 'year';
  due: string; // ISO
  /** [п. 22] ПОСЛЕДНИЙ день отчётного периода; закрыть можно с periodEnd + 1. */
  periodEnd: string | null;
  status: DeadlineStatus;
  closedAt: string | null;
}

/** [п. 24] Способ оплаты — как в таблице («📱 Монобанк», не «карта»). */
export type PayMethod = 'bank' | 'cash' | 'mono' | 'diia' | 'transfer' | 'other';

export interface Payment {
  id: string;
  clientId: string;
  kopecks: number;
  period: string;
  method: PayMethod;
  date: string; // ISO
  source: 'сайт' | 'бот' | 'таблица';
  save?: SaveState;
}

export type Priority = 'critical' | 'high' | 'medium' | 'low';

export interface Task {
  id: string;
  version: number;
  clientId: string | null;
  text: string;
  due: string | null; // ISO
  priority: Priority;
  done: boolean;
}

export interface Activity {
  id: string;
  when: string; // ISO date-time
  source: 'сайт' | 'бот' | 'таблица';
  text: string;
}

export const METHOD_LABEL: Record<PayMethod, string> = {
  bank: 'на счёт', cash: 'наличными', mono: 'Монобанк', diia: 'Дія', transfer: 'переводом', other: 'другое',
};

export const MARK_LABEL: Record<ClientMark, string> = {
  pensioner: 'пенсионер', employed: 'наёмный работник', allUkraine: 'ставка по всей Украине',
};

/** [п. 16] Допустимые сочетания пометок: null — можно; строка — что не так (простыми словами). */
export function marksProblem(kind: ClientKind, marks: ClientMark[]): string | null {
  if (marks.includes('pensioner') && marks.includes('employed')) return 'Пенсионер и наёмный работник вместе не бывают — выберите одно';
  if (marks.includes('allUkraine') && kind !== 'fop1' && kind !== 'fop2') return 'Ставка по всей Украине — только для ФОП 1 и 2 группы';
  return null;
}
