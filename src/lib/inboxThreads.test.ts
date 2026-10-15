import { describe, expect, it } from 'vitest';
import { groupThreads, threadKey } from './inboxThreads';
import type { InboxItem } from '../data/types';

const m = (id: string, clientId: string | null, name: string, at: string, status: InboxItem['status'] = 'new'): InboxItem =>
  ({ id, at, clientId, clientName: name, type: 'question', snippet: id, amount: null, status });

describe('чаты «Входящих»', () => {
  const items = [
    m('a1', 'C-1', 'Олена', '2026-10-16T09:00'), m('b1', 'C-2', 'Андрій', '2026-10-16T10:00', 'accepted'),
    m('a2', 'C-1', 'Олена', '2026-10-16T11:30'), m('u1', null, '+380 50 …', '2026-10-15T20:00'),
    m('a3', 'C-1', 'Олена', '2026-10-16T08:00', 'rejected'),
  ];

  it('по клиенту, свежий чат сверху, внутри — по времени; без клиента — свой чат по имени', () => {
    const t = groupThreads(items, {});
    expect(t.map((x) => x.key)).toEqual(['C-1', 'C-2', '?+380 50 …']);
    expect(t[0]?.items.map((x) => x.id)).toEqual(['a3', 'a1', 'a2']);
    expect(t[0]?.last.id).toBe('a2');
    expect(threadKey({ clientId: null, clientName: ' +380 50 … ' })).toBe('?+380 50 …');
  });

  it('непрочитанные — позже отметки «прочитано до»; «ждут решения» — статус «новое»', () => {
    const t = groupThreads(items, { 'C-1': '2026-10-16T09:00' });
    const c1 = t.find((x) => x.key === 'C-1');
    expect([c1?.unread, c1?.open]).toEqual([1, 2]);
    expect(t.find((x) => x.key === 'C-2')?.unread).toBe(1);
    expect(groupThreads(items, { 'C-1': '2026-10-16T12:00' }).find((x) => x.key === 'C-1')?.unread).toBe(0);
  });
});
