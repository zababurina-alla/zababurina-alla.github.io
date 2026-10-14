import { describe, expect, it } from 'vitest';
import { CLIENTS } from '../data/fake';
import { parseQuickTask } from './quickTask';

// Корпус «как мама пишет задачу → что должно получиться». Сегодня — 14.10.2026. Клиенты — выдуманные.
const CORPUS: [string, { clientId: string | null; due: string | null; priority?: string; text?: string }][] = [
  ['Позвонить Ромашко завтра', { clientId: 'c1', due: '2026-10-15', text: 'Позвонить' }],
  ['позвонить ромашко', { clientId: 'c1', due: null }],
  ['Запросить первичку у Бриз 20.10', { clientId: 'c10', due: '2026-10-20' }],
  ['Продлить ключ Ясенко 26 октября', { clientId: 'c5', due: '2026-10-26' }],
  ['Напомнить Соловей об оплате сегодня', { clientId: 'c6', due: '2026-10-14' }],
  ['Сверить банк завтра', { clientId: null, due: '2026-10-15', text: 'Сверить банк' }],
  ['Отправить Вербицкому декларацию 9.11', { clientId: 'c2', due: '2026-11-09' }],
  ['Позвонить Калиновской срочно', { clientId: 'c3', due: null, priority: 'critical' }],
  ['! Проверить КВЕД Ясенко', { clientId: 'c5', due: null, priority: 'high' }],
  ['Забрать документы у Дубовика 15.10.2026', { clientId: 'c11', due: '2026-10-15' }],
  ['Написать Мирошниченко', { clientId: 'c12', due: null }],
  ['Встреча с Осокором 3 листопада', { clientId: 'c8', due: '2026-11-03' }],
  ['Купить бумагу', { clientId: null, due: null, text: 'Купить бумагу' }],
  ['Позвонить Шевчук вчера', { clientId: 'c9', due: '2026-10-13' }],
  ['Отчёт Чайки завтра', { clientId: 'c4', due: '2026-10-15' }],
  ['Позвонить Лелеке 20 окт', { clientId: 'c7', due: '2026-10-20' }],
  ['напомнить ромашко про ключ 19.10', { clientId: 'c1', due: '2026-10-19' }],
  ['Сдать отчёт по ЄСВ', { clientId: null, due: null }],
  ['Перезвонить Вербицкий 16/10', { clientId: 'c2', due: '2026-10-16' }],
  ['Ясенко: новый КВЕД, завтра', { clientId: null, due: '2026-10-15' }],
];

describe('быстрая строка задачи: корпус', () => {
  const results = CORPUS.map(([input, want]) => {
    const got = parseQuickTask(input, CLIENTS, '2026-10-14');
    const ok = got.clientId === want.clientId && got.due === want.due
      && (want.priority === undefined || got.priority === want.priority)
      && (want.text === undefined || got.text === want.text);
    return { input, want, got, ok };
  });
  const right = results.filter((r) => r.ok).length;
  it(`верно ${right} из ${CORPUS.length}`, () => {
    console.log(`Быстрая задача: верно ${right} из ${CORPUS.length}`);
    expect(results.filter((r) => !r.ok)).toEqual([]);
  });
});
