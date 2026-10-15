// «Закрыть N» (п. 5): deadlines.closeMany — отказ по одному сроку не мешает остальным; отмена одного из пакета.
import { describe, expect, it } from 'vitest';
import { fakeServer } from './fakeServer';
import type { Deadline } from './types';

describe('закрыть несколько сроков', () => {
  it('2 закрыты, у одного период не закончился — он в failed; отмена одного из пакета по requestId пакета', async () => {
    const r = await fakeServer.write({ kind: 'closeDeadlines', requestId: 'B1', items: [
      { id: 'd2', baseVersion: 1 }, { id: 'd5', baseVersion: 1 }, { id: 'd4', baseVersion: 1 },
    ] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const done = r.changes.filter((c) => c.entity === 'deadline' && (c.record as Deadline | undefined)?.status === 'done').map((c) => c.id);
    expect(done.sort()).toEqual(['d2', 'd4']);
    expect(r.failed).toEqual([expect.objectContaining({ id: 'd5', code: 'PERIOD_OPEN' })]);
    // Пара «закрытый → следующий» из ответа: у следующего квартала другое название, по нему не сопоставить.
    expect(Object.keys(r.nextOf ?? {}).sort()).toEqual(['d2', 'd4']);
    const n4 = r.nextOf?.d4;
    expect(n4 && r.changes.find((c) => c.id === n4)?.record).toMatchObject({ clientId: 'c1', status: 'new' });
    const back = await fakeServer.write({ kind: 'reopenDeadline', requestId: 'U1', id: 'd4', undoOf: 'B1' });
    expect(back.ok && back.changes.some((c) => c.id === 'd4' && (c.record as Deadline | undefined)?.status === 'new')).toBe(true);
  }, 15_000);
});
