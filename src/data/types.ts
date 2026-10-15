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
  /** null — тип в таблице не указан. */
  kind: ClientKind | null;
  marks: ClientMark[];
  employer: boolean;
  kved: { code: string; title: string }[];
  phone: string;
  /** [п. 17] Колонка F: банк / АЦСК, где выпущен ключ ЭЦП (одно поле вместо «банк» + «кем выдан»). */
  keyIssuer: string;
  keyFrom?: string | null; // ISO
  /** Почта клиента (контракт §7); null — не указана. */
  email?: string | null;
  /** Клиент подключён к Telegram-боту (уведомления, напоминания). */
  botConnected?: boolean;
  keyUntil: string | null; // ISO
  /** Начисления в месяц, копейки; считает сервер. kopecks = null → note — подсказка. */
  monthly: { name: string; kopecks: number | null; note: string }[];
}

/** Срок с датой — такие раскладываются по дням (экраны «Сегодня», «Сроки», карточка). */
export type DatedDeadline = Deadline & { due: string };
export const isDated = (d: Deadline): d is DatedDeadline => d.due !== null;

export type DeadlineStatus = 'new' | 'inProgress' | 'waiting' | 'postponed' | 'done';

export interface Deadline {
  id: string;
  version: number;
  clientId: string;
  /** Текст обязательства + метка периода («ЄСВ за III квартал»). */
  what: string;
  periodicity: 'once' | 'month' | 'quarter' | 'year';
  /** null — дата срока в таблице пустая: такой срок показываем отдельно («проверьте в таблице»). */
  due: string | null; // ISO
  /** [п. 22] ПОСЛЕДНИЙ день отчётного периода; закрыть можно с periodEnd + 1. */
  periodEnd: string | null;
  status: DeadlineStatus;
  closedAt: string | null;
}

/** [п. 24] Способ оплаты — как в таблице («📱 Монобанк», не «карта»). */
export type PayMethod = 'bank' | 'cash' | 'mono' | 'diia' | 'transfer' | 'other';

export interface Payment {
  id: string;
  version: number;
  clientId: string;
  /** null — сумма в таблице пустая или не число: в суммы не идёт, на экране «сумма не указана». */
  kopecks: number | null;
  period: string;
  method: PayMethod;
  /** ISO; null — дата в таблице пустая: платёж в группе «Без даты — проверьте в таблице», в суммы не идёт. */
  date: string | null;
  source: 'сайт' | 'бот' | 'таблица';
  /** Колонка F «📌 Статус»; пустой в таблице сервер отдаёт как expected. Нет поля — считаем полученным. */
  status?: 'received' | 'expected' | 'notReceived' | 'returned';
  save?: SaveState;
}

/** Деньги пришли: в суммы месяца идут только такие платежи. */
export function isReceived(p: Pick<Payment, 'status'>): boolean {
  return p.status === undefined || p.status === 'received';
}

export const PAY_STATUS_LABEL: Record<NonNullable<Payment['status']>, string> = {
  received: 'получено', expected: 'ожидается', notReceived: 'не получено', returned: 'возвращено',
};

export type Priority = 'critical' | 'high' | 'medium' | 'low';

/** Тип задачи — список «⚙️ Справочники» F5:F11 + call (контракт, раздел 7, п. 26). */
export type TaskType = 'report' | 'taxes' | 'salary' | 'key' | 'diia' | 'consult' | 'docs' | 'call';

export interface Task {
  id: string;
  version: number;
  clientId: string | null;
  text: string;
  due: string | null; // ISO
  type: TaskType;
  priority: Priority;
  done: boolean;
}

/** Вопрос маме (контракт v2.1, уточнение 6). Следующий вопрос сайт берёт из questions.list, а не ждёт Telegram. */
export interface Question {
  id: string;
  version: number;
  text: string;
  type: 'choice' | 'text' | 'number';
  /** Для choice — ответ только из этого списка. */
  options: string[];
  clientId: string | null;
  status: 'waiting' | 'asked';
  askedAt: string | null; // ISO date-time; null — вопрос ещё ждёт отправки (status waiting)
  answer: string | null;
}

/** «Входящие»: сообщение клиента маме из Telegram (бизнес-бот), превращённое в предложение. */
export type InboxType = 'payment' | 'document' | 'question' | 'file' | 'who';
export type InboxStatus = 'new' | 'accepted' | 'task' | 'rejected';

export interface InboxItem {
  id: string;
  version?: number;
  at: string; // ISO date-time
  clientId: string | null;
  clientName: string;
  type: InboxType;
  snippet: string;
  /** Сумма из сообщения, копейки (для type: payment). */
  amount?: number | null;
  status: InboxStatus;
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
