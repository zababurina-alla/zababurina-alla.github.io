import { describe, expect, it } from 'vitest';
import { daySummary } from './daySummary';

const names: Record<string, string> = { c1: 'Ромашко Олена', c2: 'Вербицький Андрій', c3: 'Калиновська Ірина', c4: 'Ясенко Микола' };

describe('итог дня словами', () => {
  it('просрочки с именами (не больше трёх), сегодня, неделя, ключи, задачи, вопросы; без эмодзи', () => {
    const lines = daySummary({
      today: '2026-10-15',
      deadlines: [
        { clientId: 'c1', what: '💵 Аванс ПДФО (ІІІ квартал)', due: '2026-10-10' },
        { clientId: 'c2', what: 'ЄСВ за III квартал', due: '2026-10-12' },
        { clientId: 'c3', what: 'ЄП за сентябрь', due: '2026-10-13' },
        { clientId: 'c4', what: 'Звіт', due: '2026-10-14' },
        { clientId: 'c1', what: 'ЄП за октябрь', due: '2026-10-15' },
        { clientId: 'c2', what: 'Декларація', due: '2026-10-20' },
        { clientId: 'c3', what: 'Річна декларація', due: '2026-12-01' },
      ],
      name: (id) => names[id],
      keys: [{ name: 'Ромашко Олена', keyUntil: '2026-10-01' }, { name: 'Ясенко Микола', keyUntil: '2026-10-20' }, { name: 'Х', keyUntil: null }],
      tasks: [{ done: false, due: '2026-10-01', text: 'а' }, { done: false, due: '2026-10-15', text: 'б' }, { done: true, due: '2026-10-01', text: 'в' }],
      questions: 48,
    });
    expect(lines[0]).toBe('Сегодня четверг, 15 октября.');
    expect(lines[1]).toBe('Просрочено 4 срока: Ромашко Олена — Аванс ПДФО (ІІІ квартал); Вербицький Андрій — ЄСВ за III квартал; Калиновська Ірина — ЄП за сентябрь; и ещё 1.');
    expect(lines).toContain('Сегодня последний день: Ромашко Олена — ЄП за октябрь.');
    expect(lines).toContain('На этой неделе сдать ещё 1 срок.');
    expect(lines).toContain('1 ключ ЭЦП закончился.');
    expect(lines).toContain('Ключ ЭЦП заканчивается у: Ясенко Микола.');
    expect(lines).toContain('1 задача просрочена.');
    expect(lines).toContain('1 задача на сегодня.');
    expect(lines).toContain('Дмитрий ждёт ответа на 48 вопросов.');
    expect(lines.join(' ')).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('пустой день — «Просроченных нет. Всё спокойно.»', () => {
    expect(daySummary({ today: '2026-10-15', deadlines: [], name: () => undefined, keys: [], tasks: [], questions: 0 }))
      .toEqual(['Сегодня четверг, 15 октября.', 'Просроченных сроков нет.', 'Всё спокойно.']);
  });
});
