// Быстрая строка задачи: «Позвонить Ромашко завтра» → текст, клиент, дата, срочность, тип.
// Это читалка: корпус и «верно N из M» — в quickTask.test.ts.
import { search } from './search';
import { parseUserDate } from './dates';
import type { Priority, TaskType } from '../data/types';

export interface Parsed {
  text: string;
  clientId: string | null;
  due: string | null;
  priority: Priority;
  type: TaskType;
}

// Тип по словам, первое совпадение сверху вниз: «напомнить про ключ» — ключ, а не звонок; «отчёт по ЄСВ» — отчёт.
const TYPE_RULES: [RegExp, TaskType][] = [
  [/ключ|эцп|ецп|кеп|підпис/i, 'key'],
  [/(^|\s)(д[іи][яюї]|дии)(\s|$|[.,])/i, 'diia'],
  [/зарплат|(^|\s)зп(\s|$)|відомість|ведомост/i, 'salary'],
  [/отч[её]т|зв[іi]т|декларац|сдать|здати/i, 'report'],
  [/оплат|налог|податк|(^|\s)[єе]п(\s|$)|[єе]св/i, 'taxes'],
  [/звон|дзвон|позвон|набрать|написать|напиши|написати/i, 'call'],
  [/встреч|зустріч|консульт|объясн|поясн/i, 'consult'],
];

export function taskType(text: string): TaskType {
  for (const [re, type] of TYPE_RULES) if (re.test(text)) return type;
  return 'docs';
}

const DATE_TAILS = [
  /\s+(сегодня|сьогодні|завтра|вчера|вчора)$/i,
  /\s+(\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?)$/,
  /\s+(\d{1,2}\s+[а-яіїєґ]+\.?)$/i,
];

export function parseQuickTask(input: string, clients: { id: string; name: string }[], today?: string): Parsed {
  let text = input.trim().replace(/\s+/g, ' ');
  const type = taskType(text);
  let priority: Priority = 'medium';
  if (/(^|\s)(!!|срочно|терміново)(\s|$)/i.test(text)) { priority = 'critical'; text = text.replace(/(^|\s)(!!|срочно|терміново)(?=\s|$)/i, ' ').trim(); }
  else if (/(^|\s)!(\s|$)/.test(text)) { priority = 'high'; text = text.replace(/(^|\s)!(?=\s|$)/, ' ').trim(); }

  let due: string | null = null;
  for (const re of DATE_TAILS) {
    const m = re.exec(text);
    const d = m?.[1] ? parseUserDate(m[1], today) : null;
    if (m && d) { due = d; text = text.slice(0, m.index).trim(); break; }
  }

  // Клиент: слово с заглавной (или любое после глагола), которое находит ровно одного клиента.
  let clientId: string | null = null;
  const words = text.split(' ');
  for (let i = words.length - 1; i >= 1 && !clientId; i--) {
    const w = (words[i] ?? '').replace(/[.,!?]$/, '');
    if (w.length < 4) continue;
    const found = search(clients, w);
    if (found.length === 1 && found[0]) { clientId = found[0].id; words.splice(i, 1); }
  }
  text = words.join(' ').replace(/\s+/g, ' ').trim();
  text = text.charAt(0).toUpperCase() + text.slice(1);
  return { text, clientId, due, priority, type };
}
