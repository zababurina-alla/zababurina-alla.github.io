// Выдуманные данные прототипа. Ни один клиент не взят из таблицы; совпадения фамилий случайны.
// Начисления посчитаны по ставкам 2026 из брифа (МЗП 8 647, ПМ 3 328, ЄСВ 22 % МЗП = 1 902,34) — только для вида;
// на живых данных их считает сервер.
import type { Activity, Client, Deadline, Payment, Question, Task } from './types';

const ESV = { name: 'ЄСВ', kopecks: 190234, note: '22 % МЗП' };
const EP1 = { name: 'ЄП', kopecks: 33280, note: '10 % ПМ' };
const EP2 = { name: 'ЄП', kopecks: 172940, note: '20 % МЗП' };
const VZ = { name: 'ВЗ', kopecks: 86470, note: '10 % МЗП' };
const EP3 = { name: 'ЄП', kopecks: null, note: '5 % дохода — введите оборот' };

const c = (id: string, name: string, kind: Client['kind'], kved: [string, string][], keyUntil: string | null,
  monthly: Client['monthly'], employer = false, keyIssuer = 'ПриватБанк', marks: Client['marks'] = []): Client => ({
  id, name, kind, marks, employer, kved: kved.map(([code, title]) => ({ code, title })),
  phone: `+380 00 000 ${id.slice(1).padStart(2, '0')} ${id.slice(1).padStart(2, '0')}`, keyIssuer, keyUntil, monthly, version: 1,
});

export const CLIENTS: Client[] = [
  c('c1', 'Ромашко Олена Петрівна', 'fop2', [['96.02', 'Надання послуг перукарнями та салонами краси']], '2026-10-19', [EP2, ESV, VZ]),
  c('c2', 'Вербицький Андрій Олегович', 'fop3', [['62.01', "Комп'ютерне програмування"]], '2027-03-03', [EP3, ESV], false, 'Монобанк'),
  c('c3', 'Калиновська Ірина Василівна', 'fop1', [['47.89', 'Роздрібна торгівля з лотків і на ринках']], '2027-01-11', [EP1, ESV, VZ]),
  c('c4', 'ТОВ «Чайка-Сервіс»', 'tovGeneral', [['52.29', 'Інша допоміжна діяльність у сфері транспорту']], '2026-11-30', [], true, 'Ощадбанк'),
  c('c5', 'Ясенко Микола Іванович', 'fop3', [['47.91', 'Роздрібна торгівля через інтернет']], '2026-10-26', [EP3, ESV]),
  c('c6', 'Соловей Тетяна Андріївна', 'fop2', [['56.10', 'Діяльність ресторанів']], '2027-08-08', [EP2, ESV, VZ], true),
  c('c7', 'Лелека Надія Степанівна', 'fop1', [['47.81', 'Роздрібна торгівля з лотків харчовими продуктами']], null, [EP1, VZ], false, 'ПриватБанк', ['pensioner']),
  c('c8', 'Осокор Віктор Павлович', 'fop3', [['74.10', 'Спеціалізована діяльність із дизайну']], '2027-05-14', [EP3, ESV], false, 'Монобанк'),
  c('c9', 'Шевчук Галина Миколаївна', 'fopGeneral', [['69.20', 'Діяльність у сфері бухгалтерського обліку']], '2027-02-20', [ESV]),
  c('c10', 'ТОВ «Бриз-Агро»', 'tov3', [['01.11', 'Вирощування зернових культур']], '2026-12-08', [], true, 'Укргазбанк'),
  c('c11', 'Дубовик Сергій Ігорович', 'fop2', [['45.20', 'Технічне обслуговування автотранспортних засобів']], '2027-04-02', [EP2, ESV, VZ]),
  c('c12', 'Мирошниченко Ольга Юріївна', 'fop3', [['85.59', 'Інші види освіти']], '2027-06-30', [EP3, ESV], false, 'Монобанк'),
];

// Сумм у сроков нет — в таблице нет такой колонки (контракт v2, п. 21). periodEnd — последний день периода (п. 22).
const d = (id: string, clientId: string, what: string, due: string, periodicity: Deadline['periodicity'], periodEnd: string | null = null): Deadline =>
  ({ id, clientId, what, due, periodicity, periodEnd, status: 'new', closedAt: null, version: 1 });

export const DEADLINES: Deadline[] = [
  d('d1', 'c6', 'ЄП за сентябрь', '2026-09-20', 'month', '2026-09-30'),
  d('d2', 'c7', 'ЄСВ за III квартал', '2026-10-12', 'quarter', '2026-09-30'),
  d('d3', 'c4', 'Податковий розрахунок, III квартал', '2026-10-15', 'quarter', '2026-09-30'),
  d('d4', 'c1', 'ЄСВ за III квартал', '2026-10-20', 'quarter', '2026-09-30'),
  d('d5', 'c3', 'ЄП за октябрь', '2026-10-20', 'month', '2026-10-31'),
  d('d6', 'c11', 'ЄП за октябрь', '2026-10-20', 'month', '2026-10-31'),
  d('d7', 'c9', 'ЄСВ за III квартал', '2026-10-20', 'quarter', '2026-09-30'),
  d('d8', 'c10', 'Звіт з ЄСВ, сентябрь', '2026-10-20', 'month', '2026-09-30'),
  d('d9', 'c2', 'Декларація платника ЄП, III кв.', '2026-11-09', 'quarter', '2026-09-30'),
  d('d10', 'c8', 'Декларація платника ЄП, III кв.', '2026-11-09', 'quarter', '2026-09-30'),
  d('d11', 'c5', 'Декларація платника ЄП, III кв.', '2026-11-09', 'quarter', '2026-09-30'),
  d('d12', 'c12', 'Декларація платника ЄП, III кв.', '2026-11-09', 'quarter', '2026-09-30'),
  d('d13', 'c2', 'ЄП за III квартал', '2026-11-19', 'quarter', '2026-09-30'),
  d('d14', 'c10', 'Фінансова звітність, III кв.', '2026-11-09', 'quarter', '2026-09-30'),
];

export const PAYMENTS: Payment[] = [
  { id: 'p1', version: 1, clientId: 'c1', kopecks: 150000, period: 'Октябрь 2026', method: 'bank', date: '2026-10-14', source: 'бот' },
  { id: 'p2', version: 1, clientId: 'c2', kopecks: 420000, period: 'III квартал 2026', method: 'cash', date: '2026-10-13', source: 'сайт' },
  { id: 'p3', version: 1, clientId: 'c6', kopecks: 200000, period: 'Октябрь 2026', method: 'mono', date: '2026-10-12', source: 'таблица' },
  { id: 'p4', version: 1, clientId: 'c11', kopecks: 150000, period: 'Октябрь 2026', method: 'bank', date: '2026-10-09', source: 'сайт' },
  { id: 'p5', version: 1, clientId: 'c9', kopecks: 300000, period: 'Сентябрь 2026', method: 'bank', date: '2026-10-08', source: 'бот' },
  { id: 'p6', version: 1, clientId: 'c3', kopecks: 100000, period: 'Октябрь 2026', method: 'cash', date: '2026-10-05', source: 'сайт' },
  { id: 'p7', version: 1, clientId: 'c12', kopecks: 250000, period: 'III квартал 2026', method: 'mono', date: '2026-10-03', source: 'сайт' },
  { id: 'p8', version: 1, clientId: 'c10', kopecks: 500000, period: 'Октябрь 2026', method: 'bank', date: '2026-10-02', source: 'таблица' },
  // Сентябрь: для сравнения «в сентябре» (всего 18 500,00 ₴).
  { id: 'p9', version: 1, clientId: 'c1', kopecks: 500000, period: 'Сентябрь 2026', method: 'bank', date: '2026-09-29', source: 'бот' },
  { id: 'p10', version: 1, clientId: 'c2', kopecks: 420000, period: 'Сентябрь 2026', method: 'cash', date: '2026-09-22', source: 'сайт' },
  { id: 'p11', version: 1, clientId: 'c4', kopecks: 600000, period: 'Сентябрь 2026', method: 'bank', date: '2026-09-15', source: 'таблица' },
  { id: 'p12', version: 1, clientId: 'c6', kopecks: 330000, period: 'Сентябрь 2026', method: 'mono', date: '2026-09-05', source: 'сайт' },
];


export const ACTIVITY: Activity[] = [
  { id: 'a1', when: '2026-10-14T09:12', source: 'бот', text: 'Платёж 1 500,00 ₴ от Ромашко Олены записан' },
  { id: 'a2', when: '2026-10-14T08:40', source: 'таблица', text: 'Ключ ЭЦП Ясенко Миколы продлён до 26.10.2026' },
  { id: 'a3', when: '2026-10-13T17:05', source: 'сайт', text: 'Закрыт срок «ЄСВ за III кв.» — Вербицький Андрій. Следующий создан: до 20.01.2027' },
  { id: 'a4', when: '2026-10-13T11:30', source: 'сайт', text: 'Платёж 4 200,00 ₴ от Вербицкого Андрея записан' },
];

export const TASKS: Task[] = [
  { id: 't1', version: 1, clientId: 'c1', text: 'Позвонить — продлить ключ ЭЦП', due: '2026-10-15', priority: 'high', type: 'key', done: false },
  { id: 't2', version: 1, clientId: 'c10', text: 'Запросить первичку за сентябрь', due: '2026-10-16', priority: 'medium', type: 'docs', done: false },
  { id: 't3', version: 1, clientId: 'c5', text: 'Проверить новый КВЕД 47.91', due: '2026-10-17', priority: 'low', type: 'docs', done: false },
  { id: 't4', version: 1, clientId: 'c6', text: 'Напомнить об оплате ЄП за сентябрь', due: '2026-10-14', priority: 'critical', type: 'taxes', done: false },
  { id: 't5', version: 1, clientId: null, text: 'Сверить выписку Приватбанка за неделю', due: null, priority: 'medium', type: 'docs', done: false },
];

export const QUESTIONS: Question[] = [
  { id: 'q1', version: 1, text: 'У Ясенко новый КВЕД 47.99 — добавить в карточку?', type: 'choice', options: ['Да', 'Нет', 'Уточню'],
    clientId: 'c5', status: 'asked', askedAt: '2026-10-13T21:40', answer: null },
];

export const KIND_LABEL: Record<Client['kind'], string> = {
  fop1: 'ФОП, 1 группа', fop2: 'ФОП, 2 группа', fop3: 'ФОП, 3 группа', fopGeneral: 'ФОП, общая система',
  tov3: 'ТОВ, 3 группа', tovGeneral: 'ТОВ, общая система', person: 'Физическое лицо', nonresident: 'Нерезидент',
};
