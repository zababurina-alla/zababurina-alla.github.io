// Разделы «только просмотр» (config.json → writes): кнопка записи неактивна и подписана «пока в таблице».
import { AREA_LABEL, canWrite } from '../config';
import type { WriteArea } from '../config';

export function roAttrs(area: WriteArea): { 'aria-disabled'?: true; title?: string } {
  if (canWrite(area)) return {};
  const what = AREA_LABEL[area];
  return { 'aria-disabled': true, title: `${what.charAt(0).toUpperCase()}${what.slice(1)} пока — в таблице` };
}

const DO_IT: Record<WriteArea, string> = {
  payments: 'Платежи пока записывайте в таблице',
  tasks: 'Задачи пока ведите в таблице',
  questions: 'На вопросы пока отвечайте в Telegram-боте',
  deadlines: 'Сроки пока закрывайте и меняйте в таблице',
  clients: 'Клиентов пока добавляйте и правьте в таблице',
  inbox: 'Сообщения клиентов пока решайте в Telegram',
  remind: 'Напоминания клиентам пока пишите сами в Telegram',
};

export function roMessage(area: WriteArea): string {
  // Напоминание, отправленное самой в Telegram, на сайте не появится — без этого хвоста.
  return area === 'remind' ? DO_IT[area] : `${DO_IT[area]} — на сайте появится само`;
}
