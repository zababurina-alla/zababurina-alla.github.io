import { beforeEach, describe, expect, it } from 'vitest';
import { clearSnap, readSnap, saveSnap } from './snapCache';
import { Auth } from './auth';
import type { Snapshot } from './api';

const SNAP: Snapshot = { clients: [], deadlines: [], payments: [], activity: [], tasks: [], questions: [], inbox: [], cursor: 7 };

describe('снимок до закрытия вкладки (п. 20)', () => {
  beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });

  it('сохраняется только в sessionStorage и читается обратно', () => {
    saveSnap(SNAP);
    expect(readSnap()).toEqual(SNAP);
    expect(localStorage.length).toBe(0);
  });

  it('мусор в хранилище — нет снимка, а не падение', () => {
    sessionStorage.setItem('buh.snap.v1', '{"clients":1}');
    expect(readSnap()).toBeNull();
    sessionStorage.setItem('buh.snap.v1', 'не json');
    expect(readSnap()).toBeNull();
  });

  it('«Выйти» стирает снимок вместе с сеансом', () => {
    saveSnap(SNAP);
    new Auth('https://x/exec', 'cid').signOut();
    expect(readSnap()).toBeNull();
    saveSnap(SNAP);
    clearSnap();
    expect(readSnap()).toBeNull();
  });
});
