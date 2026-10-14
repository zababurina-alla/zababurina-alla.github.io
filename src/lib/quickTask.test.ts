import { describe, expect, it } from 'vitest';
import { CLIENTS } from '../data/fake';
import { parseQuickTask } from './quickTask';

// Корпус «как мама пишет задачу → что должно получиться». Сегодня — 14.10.2026. Клиенты — выдуманные.
const CORPUS: [string, { clientId: string | null; due: string | null; priority?: string; text?: string; type: string }][] = [
  ['Позвонить Ромашко завтра', { clientId: 'c1', due: '2026-10-15', text: 'Позвонить', type: 'call' }],
  ['позвонить ромашко', { clientId: 'c1', due: null, type: 'call' }],
  ['Запросить первичку у Бриз 20.10', { clientId: 'c10', due: '2026-10-20', type: 'docs' }],
  ['Продлить ключ Ясенко 26 октября', { clientId: 'c5', due: '2026-10-26', type: 'key' }],
  ['Напомнить Соловей об оплате сегодня', { clientId: 'c6', due: '2026-10-14', type: 'taxes' }],
  ['Сверить банк завтра', { clientId: null, due: '2026-10-15', text: 'Сверить банк', type: 'docs' }],
  ['Отправить Вербицкому декларацию 9.11', { clientId: 'c2', due: '2026-11-09', type: 'report' }],
  ['Позвонить Калиновской срочно', { clientId: 'c3', due: null, priority: 'critical', type: 'call' }],
  ['! Проверить КВЕД Ясенко', { clientId: 'c5', due: null, priority: 'high', type: 'docs' }],
  ['Забрать документы у Дубовика 15.10.2026', { clientId: 'c11', due: '2026-10-15', type: 'docs' }],
  ['Написать Мирошниченко', { clientId: 'c12', due: null, type: 'call' }],
  ['Встреча с Осокором 3 листопада', { clientId: 'c8', due: '2026-11-03', type: 'consult' }],
  ['Купить бумагу', { clientId: null, due: null, text: 'Купить бумагу', type: 'docs' }],
  ['Позвонить Шевчук вчера', { clientId: 'c9', due: '2026-10-13', type: 'call' }],
  ['Отчёт Чайки завтра', { clientId: 'c4', due: '2026-10-15', type: 'report' }],
  ['Позвонить Лелеке 20 окт', { clientId: 'c7', due: '2026-10-20', type: 'call' }],
  ['напомнить ромашко про ключ 19.10', { clientId: 'c1', due: '2026-10-19', type: 'key' }],
  ['Сдать отчёт по ЄСВ', { clientId: null, due: null, type: 'report' }],
  ['Перезвонить Вербицкий 16/10', { clientId: 'c2', due: '2026-10-16', type: 'call' }],
  ['Ясенко: новый КВЕД, завтра', { clientId: null, due: '2026-10-15', type: 'docs' }],
  ['Подать заявление Ромашко через Дію', { clientId: 'c1', due: null, type: 'diia' }],
  ['Начислить зп Чайке 25.10', { clientId: 'c4', due: '2026-10-25', type: 'salary' }],
  ['Справка из академии для Шевчук', { clientId: 'c9', due: null, type: 'docs' }],
];

describe('быстрая строка задачи: корпус', () => {
  const results = CORPUS.map(([input, want]) => {
    const got = parseQuickTask(input, CLIENTS, '2026-10-14');
    const ok = got.clientId === want.clientId && got.due === want.due
      && (want.priority === undefined || got.priority === want.priority)
      && (want.text === undefined || got.text === want.text)
      && got.type === want.type;
    return { input, want, got, ok };
  });
  const right = results.filter((r) => r.ok).length;
  it(`верно ${right} из ${CORPUS.length}`, () => {
    console.log(`Быстрая задача: верно ${right} из ${CORPUS.length}`);
    expect(results.filter((r) => !r.ok)).toEqual([]);
  });
});
