// Правка и удаление задач (п. 14) на учебном сервере — те же правила, что у tasks.update / tasks.delete.
import { describe, expect, it } from 'vitest';
import { fakeServer } from './fakeServer';
import { TASKS } from './fake';

describe('задачи: правка и удаление', () => {
  it('правка по версии; сделанную — VALIDATION; чужая версия — CONFLICT с current; удаление — delete', async () => {
    const [open, other] = TASKS.filter((t) => !t.done);
    expect(open && other).toBeTruthy();
    if (!open || !other) return;
    const c = await fakeServer.write({ kind: 'completeTask', requestId: 'T0', id: other.id, done: true });
    const done = c.ok ? c.changes[0]?.record as typeof other : other;
    const r = await fakeServer.write({ kind: 'updateTask', requestId: 'T1', id: open.id, baseVersion: open.version, patch: { text: 'Новый текст', due: null } });
    expect(r.ok && r.changes[0]?.record).toMatchObject({ id: open.id, text: 'Новый текст', due: null });
    const stale = await fakeServer.write({ kind: 'updateTask', requestId: 'T2', id: open.id, baseVersion: open.version, patch: { text: 'ещё' } });
    expect(!stale.ok && stale.code).toBe('CONFLICT');
    const d = await fakeServer.write({ kind: 'updateTask', requestId: 'T3', id: done.id, baseVersion: done.version, patch: { text: 'x' } });
    expect(!d.ok && d.code).toBe('VALIDATION');
    const cur = !stale.ok && stale.current && 'version' in stale.current ? stale.current.version : -1;
    const del = await fakeServer.write({ kind: 'deleteTask', requestId: 'T4', id: open.id, baseVersion: cur });
    expect(del.ok && del.changes[0]).toMatchObject({ entity: 'task', op: 'delete', id: open.id });
  }, 20_000);
});
