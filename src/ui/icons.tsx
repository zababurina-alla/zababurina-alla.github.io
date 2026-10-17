// Набор значков «Бухгалтерии». Свои, нарисованы для этого кабинета: сетка 24, линия 1,75, скруглённые концы и углы.
// Цвет — currentColor, поэтому светлая и тёмная темы работают сами. Значки срочности — «цвет + форма»
// (заливка там, где срочно), чтобы различались и без цвета.
// Единый словарь «одно понятие — один значок» и соответствие эмодзи таблицы — docs/словарь-значков.md.
// Перечень понятий — от координатора «Мамы CRM» (docs\сайт\сущности.md, 160 строк, 14.10.2026).
import type { ReactElement } from 'react';

const DOC = <><path d="M6 2.75h8.5L19 7.25v14H6z" /><path d="M14.5 2.75v4.5H19" /></>;
const CAL = <><rect x="3" y="4.5" width="18" height="16.5" rx="2.5" /><path d="M3 9.5h18M8 2.75v3.5M16 2.75v3.5" /></>;
const CIRCLE = <circle cx="12" cy="12" r="9" />;
const USER = <><circle cx="12" cy="8" r="3.75" /><path d="M4.5 20.5c1-3.6 3.9-5.5 7.5-5.5s6.5 1.9 7.5 5.5" /></>;
const CLOUD = <path d="M7 18.5a4.5 4.5 0 1 1 1-8.9A6 6 0 0 1 19.5 11 3.75 3.75 0 0 1 18 18.5H7Z" />;
const BELL = <><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" /><path d="M10 21a2 2 0 0 0 4 0" /></>;
const KEY = <><circle cx="8" cy="15" r="4" /><path d="m10.8 12.2 8.7-8.7M16 7l2.5 2.5M18.5 4.5 21 7" /></>;
const CHECK = <path d="m8 12.5 3 3 5-6" />;
const COIN = <circle cx="12" cy="12" r="8.75" />;
const MAIL = <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m3.5 6.5 8.5 6.5 8.5-6.5" /></>;
const BANKNOTE = <><rect x="2.5" y="6.5" width="19" height="11" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 9.5h.01M18 14.5h.01" /></>;
const RECEIPT = <path d="M6 2.75h12v18.5l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5z" />;
const HOURGLASS = <path d="M7 3h10M7 21h10M8 3v3.5a4 4 0 0 0 4 4 4 4 0 0 0 4-4V3M8 21v-3.5a4 4 0 0 1 4-4 4 4 0 0 1 4 4V21" />;

export interface IconDef {
  label: string;
  cat: string;
  el: ReactElement;
  /** Залитый значок срочности: глиф рисуется цветом фона. */
  filled?: boolean;
  /** Мягкая подложка под линией (как в «Сверке рейсов»): заливка цветом значка 16 %, без обводки. */
  tone?: ReactElement;
}

export const ICONS = {
  // ── Разделы
  today: { cat: 'Разделы', label: 'Сегодня', tone: <circle cx="12" cy="12" r="4" />, el: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></> },
  clients: { cat: 'Разделы', label: 'Клиенты', tone: <path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5z" />, el: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.6.8 2.6 2.6 3 5.2" /></> },
  deadlines: { cat: 'Разделы', label: 'Сроки', tone: <path d="M3 7a2.5 2.5 0 0 1 2.5-2.5h13A2.5 2.5 0 0 1 21 7v2.5H3z" />, el: <>{CAL}<circle cx="12" cy="15.25" r="3.25" /><path d="M12 13.75v1.5l1 .75" /></> },
  tasks: { cat: 'Разделы', label: 'Задачи', tone: <rect x="2.5" y="3.5" width="6" height="17" rx="2" />, el: <path d="M10 6h10M10 12h10M10 18h10m-16.5-12 1.2 1.2L7 5m-3.5 7 1.2 1.2L7 11m-3.5 7 1.2 1.2L7 17" /> },
  payments: { cat: 'Разделы', label: 'Платежи', tone: <path d="M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />, el: <><path d="M4 7h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12" /><circle cx="16.5" cy="13.5" r="1.25" /></> },
  keys: { cat: 'Разделы', label: 'Ключи ЭЦП', tone: <circle cx="8" cy="15" r="4" />, el: KEY },
  reference: { cat: 'Разделы', label: 'Справочник налогов', tone: <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />, el: <><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z" /><path d="M4 19a2 2 0 0 0 2 2h13M9 8h6" /></> },
  kved: { cat: 'Разделы', label: 'КВЕДы', el: <path d="M10 3.5 8 20.5M16 3.5l-2 17M4.5 9h16M3.5 15h16" /> },
  month: { cat: 'Разделы', label: 'Месячный чек-лист', el: <>{CAL}<path d="m8.5 15 2.3 2.3 4.7-4.6" /></> },
  staff: { cat: 'Разделы', label: 'Працівники', el: <><rect x="4" y="3" width="16" height="18" rx="2.5" /><circle cx="12" cy="10" r="2.5" /><path d="M8 17.5c.7-1.8 2.2-2.8 4-2.8s3.3 1 4 2.8M10 3v2h4V3" /></> },
  payroll: { cat: 'Разделы', label: 'Відомість (зарплата)', el: <><rect x="2.5" y="8" width="16" height="10" rx="2" /><circle cx="10.5" cy="13" r="2.25" /><path d="M5.5 5h14a2 2 0 0 1 2 2v8" /></> },
  calculator: { cat: 'Разделы', label: 'Калькулятор', el: <><rect x="5" y="2.75" width="14" height="18.5" rx="2.5" /><path d="M8 7h8M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01M8.5 15h.01M12 15h.01M15.5 15h.01M8.5 18.5h.01M12 18.5h.01M15.5 18.5h.01" /></> },
  consult: { cat: 'Разделы', label: 'Консультации', el: <path d="M3 6.5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H9l-3.5 3v-3H5a2 2 0 0 1-2-2zM19 8.5h.5a2 2 0 0 1 2 2V15a2 2 0 0 1-2 2H19v3l-3.5-3H12" /> },
  questions: { cat: 'Разделы', label: 'Вопросы маме', tone: <path d="M4 5h16v11H9l-5 4z" />, el: <><path d="M4 5h16v11H9l-5 4V5Z" /><path d="M10 9.2a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6.9v.4M12 14.2v.1" /></> },
  audit: { cat: 'Разделы', label: 'Аудит системы', el: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M6.5 12h2.5l1.5-3 3 6 1.5-3h2.5" /></> },
  archive: { cat: 'Разделы', label: 'Архив', el: <><rect x="3" y="4" width="18" height="5" rx="1.5" /><path d="M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4" /></> },
  help: { cat: 'Разделы', label: 'Помощь', el: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="m5.6 5.6 3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6" /></> },
  search: { cat: 'Разделы', label: 'Поиск', tone: <circle cx="11" cy="11" r="6.5" />, el: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></> },
  assistant: { cat: 'Разделы', label: 'Помощник', el: <path d="m11 3 1.8 4.7 4.7 1.8-4.7 1.8L11 16l-1.8-4.7L4.5 9.5l4.7-1.8zM18.5 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /> },
  settings: { cat: 'Разделы', label: 'Настройки', el: <><circle cx="12" cy="12" r="3" /><path d="m12 2.75 1.6 2.3 2.7-.6.6 2.7 2.3 1.6L17.9 12l1.3 2.4-2.3 1.6-.6 2.7-2.7-.6L12 21.25l-1.6-2.3-2.7.6-.6-2.7-2.3-1.6L6.1 12 4.8 9.6l2.3-1.6.6-2.7 2.7.6z" /></> },

  // ── Обязательства
  declaration: { cat: 'Обязательства', label: 'Декларация (годовая)', tone: <path d="M6 2.75h8.5L19 7.25v14H6z" />, el: <>{DOC}<path d="M9 11.5h6.5M9 15h6.5M9 18.5h3.5" /></> },
  declarationQuarter: { cat: 'Обязательства', label: 'Декларация квартальная', tone: <path d="M6 2.75h8.5L19 7.25v14H6z" />, el: <>{DOC}<circle cx="12.5" cy="15.5" r="3.25" /><path d="M12.5 12.25v3.25h3.25" /></> },
  taxEp: { cat: 'Обязательства', label: 'ЄП (единый налог)', tone: <circle cx="12" cy="12" r="8.75" />, el: <>{COIN}<path d="M14.5 9.2a3.2 3.2 0 0 0-5.3 1.1M9 12h4.5M14.5 14.8a3.2 3.2 0 0 1-5.3-1.1" /></> },
  taxPay: { cat: 'Обязательства', label: 'Налог к оплате (ПДФО, прочие)', tone: <circle cx="12" cy="12" r="8.75" />, el: <>{COIN}<path d="M14.3 9.4a2.4 2.4 0 0 0-4.2 1.1c0 2.6 4.2 1.7 4.2 4.1a2.4 2.4 0 0 1-4.4 1M8.5 11h6M8.5 13.5h6" /></> },
  esv: { cat: 'Обязательства', label: 'ЄСВ (соцвзнос)', tone: <path d="M3 12a9 9 0 0 1 18 0z" />, el: <><path d="M3 12a9 9 0 0 1 18 0z" /><path d="M12 12v6a2 2 0 0 1-4 0M12 3v.01" /></> },
  vz: { cat: 'Обязательства', label: 'Военный сбор', tone: <path d="M12 3 19 6v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />, el: <path d="M12 3 19 6v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /> },
  staffReport: { cat: 'Обязательства', label: 'Податковий розрахунок (по наёмным)', el: <>{DOC}<circle cx="12.5" cy="12.75" r="2" /><path d="M9.5 18.5c.5-1.6 1.6-2.5 3-2.5s2.5.9 3 2.5" /></> },
  incomeTax: { cat: 'Обязательства', label: 'Декларация прибутку', el: <>{DOC}<path d="m9 18 2.5-3 2 1.5L16 13" /></> },
  vat: { cat: 'Обязательства', label: 'ПДВ', el: <><path d="M18.5 5.5 5.5 18.5" /><circle cx="7.5" cy="7.5" r="2.5" /><circle cx="16.5" cy="16.5" r="2.5" /></> },
  property: { cat: 'Обязательства', label: 'Декларация про майновий стан', el: <path d="m3 11 9-7.5 9 7.5M5 9.5V21h14V9.5M10 21v-5h4v5" /> },
  taxAgent: { cat: 'Обязательства', label: 'Звіт податкового агента', el: <>{DOC}<circle cx="12.5" cy="15.25" r="3.25" /><path d="M9.25 15.25h6.5M12.5 12c1.1 1.2 1.1 5.3 0 6.5" /></> },
  land: { cat: 'Обязательства', label: 'Аренда земли', el: <path d="M12 21v-8M12 13c0-4-3-6-7-6 0 4 3 6 7 6zM12 11c0-3.5 2.5-5.5 6.5-5.5 0 3.5-2.5 5.5-6.5 5.5z" /> },
  excise: { cat: 'Обязательства', label: 'Акциз', el: <path d="M10 2.75h4M10.5 2.75v4l-2 2.5V20a1.25 1.25 0 0 0 1.25 1.25h4.5A1.25 1.25 0 0 0 15.5 20V9.25l-2-2.5v-4M8.5 13h7" /> },
  balance: { cat: 'Обязательства', label: 'Баланс', el: <path d="M12 3v18M7.5 21h9M4 7h16M4 7l-2.5 6a2.5 2.5 0 0 0 5 0zM20 7l-2.5 6a2.5 2.5 0 0 0 5 0z" /> },

  // ── Периодичность
  once: { cat: 'Периодичность', label: 'Разово', el: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><path d="M12 12h.01" /></> },
  monthly: { cat: 'Периодичность', label: 'Ежемесячно', el: <>{CAL}<path d="m10.5 14 1.75-1.25V18.5" /></> },
  quarterly: { cat: 'Периодичность', label: 'Ежеквартально', el: <>{CAL}<path d="M7.5 15.5h1.5M11.25 15.5h1.5M15 15.5h1.5" /></> },
  yearly: { cat: 'Периодичность', label: 'Раз в год', el: <>{CAL}<path d="m12 12.25.9 1.9 2.1.3-1.5 1.4.4 2.1-1.9-1-1.9 1 .4-2.1-1.5-1.4 2.1-.3z" /></> },

  // ── Типы клиентов
  fop: { cat: 'Тип клиента', label: 'ФОП (1, 2, 3 группа)', tone: <circle cx="12" cy="8" r="3.75" />, el: USER },
  fopGeneral: { cat: 'Тип клиента', label: 'ФОП на общей системе', el: <><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M8.5 7V5a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 15.5 5v2M3 12.5h18" /></> },
  tov: { cat: 'Тип клиента', label: 'ТОВ', tone: <path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16z" />, el: <><path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M2 21h20" /><path d="M8 7h4M8 11h4M8 15h4" /></> },
  person: { cat: 'Тип клиента', label: 'Физическое лицо', el: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="10" r="3" /><path d="M6.5 18c1.3-2 3.2-3 5.5-3s4.2 1 5.5 3" /></> },
  nonresident: { cat: 'Тип клиента', label: 'Нерезидент', el: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5Z" /></> },
  bot: { cat: 'Тип клиента', label: 'Подключён к боту', tone: <rect x="4" y="7" width="16" height="12" rx="3" />, el: <><rect x="4" y="7" width="16" height="12" rx="3" /><path d="M12 3v4M9 12v1M15 12v1M9.5 16h5" /></> },

  // ── Где ключ и способ оплаты
  bank: { cat: 'Банк и оплата', label: 'Банк (на счёт)', tone: <path d="M4.5 9.5h15v8h-15z" />, el: <path d="M3 9.5 12 4l9 5.5M4.5 9.5v8M9 9.5v8M15 9.5v8M19.5 9.5v8M3 20.5h18" /> },
  taxOffice: { cat: 'Банк и оплата', label: 'Налоговая (ДПС)', el: <path d="M3 20.5h18M5 20.5V9l7-5 7 5v11.5M9.5 20.5v-5h5v5M12 9.5v.01" /> },
  diia: { cat: 'Банк и оплата', label: 'Дія', tone: <rect x="6.5" y="2.75" width="11" height="18.5" rx="2.5" />, el: <><rect x="6.5" y="2.75" width="11" height="18.5" rx="2.5" /><path d="M11 18h2" /></> },
  cash: { cat: 'Банк и оплата', label: 'Наличными', tone: <rect x="2.5" y="6.5" width="19" height="11" rx="2" />, el: BANKNOTE },
  card: { cat: 'Банк и оплата', label: 'На карту', tone: <path d="M2.5 7.5a2 2 0 0 1 2-2h15a2 2 0 0 1 2 2V10h-19z" />, el: <><rect x="2.5" y="5.5" width="19" height="13" rx="2" /><path d="M2.5 10h19M6.5 15h4" /></> },
  transfer: { cat: 'Банк и оплата', label: 'Перевод', el: <path d="M4 8h14l-3-3M20 16H6l3 3" /> },
  other: { cat: 'Банк и оплата', label: 'Другое', el: <path d="M5 12h.01M12 12h.01M19 12h.01" /> },

  // ── Статус работы
  statusNew: { cat: 'Статус работы', label: 'Новое', el: <>{CIRCLE}<path d="m12 7.5 1.2 3.3 3.3 1.2-3.3 1.2L12 16.5l-1.2-3.3L7.5 12l3.3-1.2z" /></> },
  inProgress: { cat: 'Статус работы', label: 'В работе', el: <path d="M20 12a8 8 0 0 1-14.3 5M4 12a8 8 0 0 1 14.3-5M18.5 3v4h-4M5.5 21v-4h4" /> },
  waiting: { cat: 'Статус работы', label: 'Ждём клиента / ожидается', tone: <path d="M8 21v-3.5a4 4 0 0 1 4-4 4 4 0 0 1 4 4V21z" />, el: HOURGLASS },
  postponed: { cat: 'Статус работы', label: 'Отложено', el: <>{CIRCLE}<path d="M10 9v6M14 9v6" /></> },
  done: { cat: 'Статус работы', label: 'Готово / сдано и оплачено', tone: <circle cx="12" cy="12" r="9" />, el: <>{CIRCLE}{CHECK}</> },
  submitted: { cat: 'Статус работы', label: 'Сдано (отчёт подан)', el: <path d="M21 3 10 14M21 3l-6.5 18-4.5-7-7-4.5z" /> },
  paid: { cat: 'Статус работы', label: 'Оплачено', el: <><rect x="2.5" y="6.5" width="19" height="11" rx="2" /><path d="m9 12 2 2 4-4" /></> },
  notStarted: { cat: 'Статус работы', label: 'Не начато', el: <circle cx="12" cy="12" r="9" strokeDasharray="3.5 3" /> },
  partial: { cat: 'Статус работы', label: 'Частично', el: <>{CIRCLE}<path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" /></> },

  // ── Статус платежа
  received: { cat: 'Статус платежа', label: 'Получено', tone: <path d="M4 15h16v3a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" />, el: <path d="M12 3v11m-4-4 4 4 4-4M4 15v3a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-3" /> },
  notReceived: { cat: 'Статус платежа', label: 'Не пришло', el: <>{CIRCLE}<path d="m9 9 6 6M15 9l-6 6" /></> },
  returned: { cat: 'Статус платежа', label: 'Возвращено', el: <>{CIRCLE}<path d="M9 10h5a2.5 2.5 0 0 1 0 5h-3M11 7.5 8.5 10l2.5 2.5" /></> },

  // ── Срочность: цвет + форма (одни пороги: < 0, 0–7, 8–30, > 30)
  overdue: { cat: 'Срочность', label: 'Просрочено (< 0 дн.)', filled: true, el: <><circle cx="12" cy="12" r="9.5" fill="currentColor" stroke="none" /><path d="M12 7v6M12 16.5v.01" className="glyph" /></> },
  burning: { cat: 'Срочность', label: 'Горит (0–7 дн.)', filled: true, el: <><circle cx="12" cy="12" r="9.5" fill="currentColor" stroke="none" /><path d="M12 7.5V12l3 2" className="glyph" /></> },
  soon: { cat: 'Срочность', label: 'Скоро (8–30 дн.)', tone: <circle cx="12" cy="12" r="9" />, el: <>{CIRCLE}<path d="M12 7.5V12l3 2" /></> },
  ok: { cat: 'Срочность', label: 'В порядке (> 30 дн. или сделано)', tone: <circle cx="12" cy="12" r="9" />, el: <>{CIRCLE}{CHECK}</> },
  inactive: { cat: 'Срочность', label: 'Неактивно (архив, уволен)', tone: <circle cx="12" cy="12" r="9" />, el: <>{CIRCLE}<path d="M8 12h8" /></> },

  // ── Приоритет задачи
  critical: { cat: 'Приоритет', label: 'Критический', tone: <path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.4 2.7-5.6 3.9-8.3.8 1.7 1.8 2.6 2.9 2.9.3-2.6 1.2-4.8 2.7-6.4.4 3.6 3.5 5.9 3.5 10.6 0 4.4-2.8 7.4-6.5 7.4z" />, el: <path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.4 2.7-5.6 3.9-8.3.8 1.7 1.8 2.6 2.9 2.9.3-2.6 1.2-4.8 2.7-6.4.4 3.6 3.5 5.9 3.5 10.6 0 4.4-2.8 7.4-6.5 7.4z" /> },
  high: { cat: 'Приоритет', label: 'Высокий', el: <path d="m7 12 5-5 5 5M7 17.5l5-5 5 5" /> },
  medium: { cat: 'Приоритет', label: 'Средний', el: <path d="M6 10h12M6 14h12" /> },
  low: { cat: 'Приоритет', label: 'Низкий', el: <path d="m7 9.5 5 5 5-5" /> },

  // ── Типы задач (сверх уже названных: отчёт = декларация, налоги = налог, зарплата = наличные, ключ, Дія)
  documents: { cat: 'Тип задачи', label: 'Документы, первичка', tone: <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />, el: <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /> },
  call: { cat: 'Тип задачи', label: 'Звонок, телефон', tone: <path d="M5 3h3l2 5-2.5 1.5a11 11 0 0 0 5 5L14 12l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2Z" />, el: <path d="M5 3h3l2 5-2.5 1.5a11 11 0 0 0 5 5L14 12l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2Z" /> },
  remindPay: { cat: 'Тип задачи', label: 'Напомнить об оплате', el: BELL },
  bankCheck: { cat: 'Тип задачи', label: 'Сверить банк', el: <><path d="M3 9.5 12 4l9 5.5M3 20.5h9M4.5 9.5v8M9 9.5v8" /><path d="m14 17 2 2 4.5-4.5" /></> },

  // ── Аудит
  auditCritical: { cat: 'Аудит', label: 'Критично', el: <><path d="M8.3 3h7.4L21 8.3v7.4L15.7 21H8.3L3 15.7V8.3z" /><path d="m9.5 9.5 5 5M14.5 9.5l-5 5" /></> },
  warning: { cat: 'Аудит', label: 'Предупреждение', tone: <path d="M12 3 2 20h20L12 3Z" />, el: <><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4M12 17v.1" /></> },
  info: { cat: 'Аудит', label: 'К сведению', tone: <circle cx="12" cy="12" r="9" />, el: <>{CIRCLE}<path d="M12 11v5M12 8v.01" /></> },
  checkFailed: { cat: 'Аудит', label: 'Проверка не сработала', el: <>{CIRCLE}<path d="m5.6 5.6 12.8 12.8" /></> },

  // ── История и сообщения
  receipt: { cat: 'История', label: 'Квитанция', el: <>{RECEIPT}<path d="M9 8h6M9 12h6M9 16h3" /></> },
  message: { cat: 'История', label: 'Сообщение клиента', el: MAIL },
  sent: { cat: 'История', label: 'Уведомление отправлено', el: <path d="M21 3 10 14M21 3l-6.5 18-4.5-7-7-4.5z" /> },
  notInBot: { cat: 'История', label: 'Клиент не в боте', el: <><circle cx="10" cy="8" r="3.5" /><path d="M3.5 20c.8-3.4 3.3-5.2 6.5-5.2 1.3 0 2.5.3 3.5.9M16 15l5 5M21 15l-5 5" /></> },
  attach: { cat: 'История', label: 'Файл к сообщению', el: <path d="M20 11.5l-7.6 7.6a5 5 0 0 1-7.1-7.1l8-8a3.4 3.4 0 0 1 4.8 4.8l-7.7 7.7a1.8 1.8 0 0 1-2.6-2.6l7.1-7.1" /> },
  edited: { cat: 'История', label: 'Запись изменена', el: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /> },

  // ── Уведомления бота
  morning: { cat: 'Уведомления', label: 'Утренняя сводка', el: <path d="M3 18h18M5.5 18a6.5 6.5 0 0 1 13 0M12 4v3M4.9 9.9l1.4 1.4M19.1 9.9l-1.4 1.4M8 21h8" /> },
  attention: { cat: 'Уведомления', label: 'Нужно внимание', el: <>{BELL}<path d="M3.5 7.5A8 8 0 0 1 6 3.5M20.5 7.5A8 8 0 0 0 18 3.5" /></> },
  evening: { cat: 'Уведомления', label: 'Вечерний итог', el: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /> },
  weekly: { cat: 'Уведомления', label: 'Недельная сводка', el: <>{CAL}<path d="M7 14h10M7 17.5h6" /></> },
  news: { cat: 'Уведомления', label: 'Новости законов', el: <path d="M4 5h13v14a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2zM17 9h3v10a2 2 0 0 1-2 2M7 9h7M7 12.5h7M7 16h4" /> },
  tip: { cat: 'Уведомления', label: 'Совет дня', el: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" /> },

  // ── Поля клиента
  email: { cat: 'Поля клиента', label: 'Почта', el: MAIL },
  star: { cat: 'Поля клиента', label: 'Главный КВЕД — по нему ЄП', filled: true, el: <path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.6l-5.1 2.7 1-5.7-4.1-4 5.7-.8z" fill="currentColor" strokeLinejoin="round" /> },
  password: { cat: 'Поля клиента', label: 'Пароль', tone: <rect x="4" y="10" width="16" height="11" rx="2.5" />, el: <><rect x="4" y="10" width="16" height="11" rx="2.5" /><path d="M8 10V7.5a4 4 0 0 1 8 0V10M12 14v3" /></> },
  date: { cat: 'Поля клиента', label: 'Дата', el: CAL },
  daysLeft: { cat: 'Поля клиента', label: 'Сколько дней осталось', el: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 1.5M10 2.75h4" /></> },
  taxSystem: { cat: 'Поля клиента', label: 'Система налогообложения', el: <>{RECEIPT}<path d="m9.5 15 5-6M9.5 9.5h.01M14.5 14.5h.01" /></> },
  income: { cat: 'Поля клиента', label: 'Доход', el: <path d="m3 17 6-6 4 4 8-8M15 7h6v6" /> },
  language: { cat: 'Поля клиента', label: 'Язык', el: <path d="M4 5h9M8.5 3v2c0 4.5-2.5 8-5.5 9.5M6 10c1.5 2.5 3.5 4 6 4.5M13 21l4-9 4 9M14.5 18h5" /> },

  // ── Действия
  plus: { cat: 'Действия', label: 'Добавить', el: <path d="M12 5v14M5 12h14" /> },
  check: { cat: 'Действия', label: 'Сдано и оплачено (закрыть)', el: <path d="m5 12.5 4.5 4.5L19 7.5" /> },
  checkAll: { cat: 'Действия', label: 'Всё оплачено (пакетом)', el: <path d="m2 12.5 4 4L15 7.5M10.5 16l.5.5L22 7.5" /> },
  eyeOff: { cat: 'Действия', label: 'Убрать с сайта', el: <><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.6 3.5M6.6 6.6C3.7 8.5 2 12 2 12s3.5 7 10 7c1.9 0 3.5-.6 4.9-1.4" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" /></> },
  eye: { cat: 'Действия', label: 'Показать', tone: <circle cx="12" cy="12" r="3" />, el: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></> },
  clientCard: { cat: 'Действия', label: 'Карточка клиента', el: <><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><circle cx="8.5" cy="11" r="2" /><path d="M5.5 16c.6-1.4 1.7-2 3-2s2.4.6 3 2M14 10h5M14 13.5h3" /></> },
  reply: { cat: 'Действия', label: 'Ответить', el: <path d="M9 6 3 12l6 6M3 12h11a7 7 0 0 1 7 7" /> },
  later: { cat: 'Действия', label: 'Позже', el: <path d="M12 7v5l3 2M21 12a9 9 0 1 1-3-6.7M21 4v4h-4" /> },
  undo: { cat: 'Действия', label: 'Отменить', el: <path d="M9 7 4 12l5 5M4 12h10a6 6 0 0 1 0 12h-2" /> },
  copy: { cat: 'Действия', label: 'Скопировать', el: <><rect x="8" y="8" width="13" height="13" rx="2.5" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></> },
  share: { cat: 'Действия', label: 'Отправить клиенту', el: <><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.2 10.8 7.6-4.6M8.2 13.2l7.6 4.6" /></> },
  pdf: { cat: 'Действия', label: 'Выписка PDF', el: <>{DOC}<path d="M12.5 11v6.5M10 15l2.5 2.5L15 15" /></> },
  toCalendar: { cat: 'Действия', label: 'В календарь', el: <>{CAL}<path d="M12 12.5v5.5M9.75 15.75 12 18l2.25-2.25" /></> },
  backup: { cat: 'Действия', label: 'Резервная копия', el: <>{CLOUD}<path d="M12 16.5v-5M9.75 13.5 12 11.25l2.25 2.25" /></> },
  mic: { cat: 'Действия', label: 'Голосом', el: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></> },
  camera: { cat: 'Действия', label: 'Фото', el: <><path d="M3 8a2 2 0 0 1 2-2h2.5L9 4h6l1.5 2H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><circle cx="12" cy="13" r="3.5" /></> },
  close: { cat: 'Действия', label: 'Закрыть', el: <path d="M6 6l12 12M18 6 6 18" /> },
  logout: { cat: 'Оболочка', label: 'Выйти', el: <><path d="M14 4h3.5A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5H14" /><path d="M10 8l-4 4 4 4M6 12h10" /></> },

  // ── Кадры (вторая очередь)
  employeeActive: { cat: 'Кадры', label: 'Работник активен', el: <><circle cx="10" cy="8" r="3.5" /><path d="M3.5 20c.8-3.4 3.3-5.2 6.5-5.2 1.3 0 2.5.3 3.5.9M15.5 17.5l2 2 4-4" /></> },
  dismissed: { cat: 'Кадры', label: 'Уволен', el: <path d="M14 3H6v18h8M10 12h11M18 9l3 3-3 3" /> },
  disability: { cat: 'Кадры', label: 'Инвалидность', el: <><circle cx="12" cy="4.5" r="1.5" /><path d="m6 8.5 6 1 6-1M12 9.5v5l-3 6M12 14.5l3 6" /></> },
  salary: { cat: 'Кадры', label: 'Оклад, зарплата', el: BANKNOTE },
  bonus: { cat: 'Кадры', label: 'Премия', el: <path d="M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8C10.5 4.5 7 4.5 7 6.5S10 8 12 8zM12 8c1.5-3.5 5-3.5 5-1.5S14 8 12 8z" /> },
  sickLeave: { cat: 'Кадры', label: 'Больничный', el: <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M12 8v8M8 12h8" /></> },
  vacation: { cat: 'Кадры', label: 'Отпуск', el: <path d="M12 4v1M5.6 6.6l.7.7M18.4 6.6l-.7.7M4 13h1M19 13h1M8 13a4 4 0 0 1 8 0M3 17c2 0 2 1.5 4 1.5s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5" /> },
  application: { cat: 'Кадры', label: 'Заява', el: <>{DOC}<path d="m9 18.5 1-3 4.5-4.5 2 2-4.5 4.5z" /></> },
  order: { cat: 'Кадры', label: 'Наказ', el: <>{DOC}<circle cx="12.5" cy="15.25" r="2.75" /><path d="M9 11h7" /></> },
  contract: { cat: 'Кадры', label: 'Договір', el: <>{DOC}<path d="M9 11.5h6.5M8.5 18c1-1.5 2-2.5 2.5-1.5s-.5 2 1 1.5 2-2 3.5-1" /></> },
  act: { cat: 'Кадры', label: 'Акт', el: <>{DOC}<path d="m9.5 15 2 2 4-4" /></> },
  timesheet: { cat: 'Кадры', label: 'Табель', el: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M3 14h18M9 4v16" /></> },

  // ── Состояния записи на сайте (бриф, п. 4 и 6)
  saving: { cat: 'Сохранение', label: 'Сохраняется в таблицу', el: <>{CLOUD}<path d="M12 16.5v-5M9.75 13.5 12 11.25l2.25 2.25" /></> },
  saved: { cat: 'Сохранение', label: 'Сохранено в таблице', tone: <path d="M7 18.5a4.5 4.5 0 1 1 1-8.9A6 6 0 0 1 19.5 11 3.75 3.75 0 0 1 18 18.5H7Z" />, el: <>{CLOUD}<path d="m9.5 14 2 2 3.5-3.5" /></> },
  failed: { cat: 'Сохранение', label: 'Не сохранилось', tone: <path d="M7 18.5a4.5 4.5 0 1 1 1-8.9A6 6 0 0 1 19.5 11 3.75 3.75 0 0 1 18 18.5H7Z" />, el: <>{CLOUD}<path d="m10 12.5 4 4M14 12.5l-4 4" /></> },
  conflict: { cat: 'Сохранение', label: 'Запись изменилась в таблице', el: <path d="M16 3h5v5M8 3H3v5M21 3l-9 9M3 3l9 9v9" /> },
  offline: { cat: 'Сохранение', label: 'Нет связи — ждёт отправки', tone: <path d="M7 18.5a4.5 4.5 0 1 1 1-8.9A6 6 0 0 1 19.5 11 3.75 3.75 0 0 1 18 18.5H7Z" />, el: <>{CLOUD}<path d="m3 3 18 18" /></> },
  sheet: { cat: 'Сохранение', label: 'Из таблицы', tone: <path d="M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3H3z" />, el: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M3 14h18M9 4v16" /></> },
  globe: { cat: 'Сохранение', label: 'С сайта', tone: <circle cx="12" cy="12" r="8.5" />, el: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5Z" /></> },

  // ── Служебные (оболочка)
  chevronRight: { cat: 'Оболочка', label: 'Дальше', el: <path d="m9 6 6 6-6 6" /> },
  chevronLeft: { cat: 'Оболочка', label: 'Назад', el: <path d="m15 6-6 6 6 6" /> },
  more: { cat: 'Оболочка', label: 'Ещё', el: <path d="M5 12h.01M12 12h.01M19 12h.01" /> },
  sun: { cat: 'Оболочка', label: 'Светлая тема', tone: <circle cx="12" cy="12" r="4" />, el: <><circle cx="12" cy="12" r="4" /><path d="M12 3v1.5M12 19.5V21M3 12h1.5M19.5 12H21M5.6 5.6l1 1M17.4 17.4l1 1M5.6 18.4l1-1M17.4 6.6l1-1" /></> },
  moon: { cat: 'Оболочка', label: 'Тёмная тема', tone: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />, el: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /> },
  sound: { cat: 'Оболочка', label: 'Звук включён', el: <path d="M4 9v6h4l5 4V5L8 9H4ZM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /> },
  soundOff: { cat: 'Оболочка', label: 'Звук выключен', el: <path d="M4 9v6h4l5 4V5L8 9H4ZM17 9.5l5 5M22 9.5l-5 5" /> },
  userPlus: { cat: 'Оболочка', label: 'Добавить клиента', tone: <circle cx="9" cy="8" r="3.5" />, el: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M19 8v6M16 11h6" /></> },
  arrowUp: { cat: 'Оболочка', label: 'Рост', el: <path d="M7 17 17 7M9 7h8v8" /> },
  arrowDown: { cat: 'Оболочка', label: 'Падение', el: <path d="M7 7l10 10M17 9v8H9" /> },
  clock: { cat: 'Оболочка', label: 'Время', tone: <circle cx="12" cy="12" r="8.5" />, el: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></> },
} satisfies Record<string, IconDef>;

export type IconName = keyof typeof ICONS;

// Старые имена, которыми уже пользуются экраны.
const ALIASES: Record<string, IconName> = {
  calendar: 'deadlines', wallet: 'payments', key: 'keys', book: 'reference', sync: 'saved', phone: 'call',
  question: 'questions', alert: 'warning', building: 'tov', sheet: 'sheet',
};

export function resolveIcon(name: string): IconDef | undefined {
  return (ICONS as Record<string, IconDef>)[name] ?? ICONS[ALIASES[name] as IconName];
}
