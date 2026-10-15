// Итог дня словами — для «Что у меня сегодня» (#/today-voice): тот же подсчёт, что на «Сегодня», но короткими
// фразами, которые удобно слушать. Эмодзи из таблицы в речь не идут.
import { daysBetween, fmtDayMonth, plural, weekday } from './dates';

export interface DayInput {
  today: string;
  deadlines: { clientId: string; what: string; due: string }[];
  /** Короткое имя клиента для речи («Ромашко Олена»); нет клиента — undefined. */
  name: (clientId: string) => string | undefined;
  keys: { name: string; keyUntil: string | null }[];
  tasks: { done: boolean; due: string | null; text: string }[];
  questions: number;
}

const SHOWN = 3; // больше трёх имён подряд на слух не запоминаются
const KEY_DAYS = 14;
const noEmoji = (s: string) => s.replace(/\p{Extended_Pictographic}️?/gu, '').replace(/\s+/g, ' ').trim();

export function daySummary(d: DayInput): string[] {
  const lines: string[] = [`Сегодня ${weekday(d.today)}, ${fmtDayMonth(d.today)}.`];
  const withDays = d.deadlines.map((x) => ({ ...x, days: daysBetween(d.today, x.due) })).sort((a, b) => a.days - b.days);
  const overdue = withDays.filter((x) => x.days < 0);
  const week = withDays.filter((x) => x.days >= 0 && x.days <= 7);
  const who = (x: { clientId: string; what: string }) => `${d.name(x.clientId) ?? 'клиент не указан'} — ${noEmoji(x.what)}`;

  if (overdue.length) {
    const more = overdue.length - SHOWN;
    lines.push(`Просрочено ${overdue.length} ${plural(overdue.length, 'срок', 'срока', 'сроков')}: ${overdue.slice(0, SHOWN).map(who).join('; ')}${more > 0 ? `; и ещё ${more}` : ''}.`);
  } else {
    lines.push('Просроченных сроков нет.');
  }
  const today = week.filter((x) => x.days === 0);
  if (today.length) lines.push(`Сегодня последний день: ${today.slice(0, SHOWN).map(who).join('; ')}${today.length > SHOWN ? `; и ещё ${today.length - SHOWN}` : ''}.`);
  const rest = week.length - today.length;
  if (rest) lines.push(`На этой неделе сдать ещё ${rest} ${plural(rest, 'срок', 'срока', 'сроков')}.`);

  const keyDays = d.keys.filter((k) => k.keyUntil).map((k) => ({ name: k.name, days: daysBetween(d.today, k.keyUntil ?? d.today) }));
  const gone = keyDays.filter((k) => k.days < 0);
  const soon = keyDays.filter((k) => k.days >= 0 && k.days <= KEY_DAYS).sort((a, b) => a.days - b.days);
  if (gone.length) lines.push(`${gone.length} ${plural(gone.length, 'ключ ЭЦП закончился', 'ключа ЭЦП закончились', 'ключей ЭЦП закончились')}.`);
  if (soon.length) lines.push(`Ключ ЭЦП заканчивается у: ${soon.slice(0, SHOWN).map((k) => k.name).join(', ')}${soon.length > SHOWN ? ` и ещё ${soon.length - SHOWN}` : ''}.`);

  const open = d.tasks.filter((t) => !t.done && t.due && t.due <= d.today);
  const late = open.filter((t) => (t.due ?? d.today) < d.today).length;
  const todayTasks = open.length - late;
  if (late) lines.push(`${late} ${plural(late, 'задача просрочена', 'задачи просрочены', 'задач просрочено')}.`);
  if (todayTasks) lines.push(`${todayTasks} ${plural(todayTasks, 'задача', 'задачи', 'задач')} на сегодня.`);
  if (d.questions) lines.push(`Дмитрий ждёт ответа на ${d.questions} ${plural(d.questions, 'вопрос', 'вопроса', 'вопросов')}.`);
  if (lines.length === 2 && !overdue.length) lines.push('Всё спокойно.');
  return lines;
}
