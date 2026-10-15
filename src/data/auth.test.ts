import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from './auth';

// Подменяем Google Identity Services: initialize запоминает callback, renderButton считает перерисовки.
type Cfg = { nonce: string; callback: (r: { credential?: string }) => void };
let cfg: Cfg | null = null;
let renders = 0;

function installGis() {
  (window as unknown as { google: unknown }).google = {
    accounts: { id: {
      initialize: (c: Cfg) => { cfg = c; },
      renderButton: () => { renders++; },
      prompt: () => undefined,
      disableAutoSelect: () => undefined,
      cancel: () => undefined,
    } },
  };
}

/** Сервер: выдаёт nonce N1, N2, …; auth.login отвечает по очереди заготовками. */
function server(loginReplies: unknown[]) {
  let n = 0;
  const sent: { action: string; payload?: { nonce?: string } }[] = [];
  const fetchImpl = vi.fn(async (_u: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { action: string; payload?: { nonce?: string } };
    sent.push(body);
    const reply = body.action === 'auth.nonce' ? { ok: true, data: { nonce: `N${++n}` }, cursor: null } : loginReplies.shift();
    return new Response(JSON.stringify(reply), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, sent };
}

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); };
const invalid = { ok: false, error: { code: 'AUTH_INVALID', message: 'Не получилось войти — попробуйте ещё раз' }, current: null };

describe('вход: одноразовый код (nonce)', () => {
  beforeEach(() => { cfg = null; renders = 0; installGis(); sessionStorage.clear(); });
  afterEach(() => { vi.useRealTimers(); });

  it('отказ AUTH_INVALID → сразу новый код и кнопка заново; повтор уходит с новым кодом', async () => {
    const s = server([invalid, { ok: true, data: { session: 'S', expiresAt: '2099-01-01T00:00:00Z', user: { email: 'a', name: 'А', role: 'owner' } }, cursor: null }]);
    const a = new Auth('https://x/exec', 'cid', s.fetchImpl);
    const el = document.createElement('div');
    await a.mountButton(el);
    expect(cfg?.nonce).toBe('N1');
    cfg?.callback({ credential: 'tok1' });
    await flush();
    expect(a.getState().error).toContain('ещё раз');
    expect(cfg?.nonce).toBe('N2');
    expect(renders).toBe(2);
    cfg?.callback({ credential: 'tok2' });
    await flush();
    expect(s.sent.filter((x) => x.action === 'auth.login').map((x) => x.payload?.nonce)).toEqual(['N1', 'N2']);
    expect(a.getState().status).toBe('signedIn');
  });

  it('тот же код второй раз не отправляется', async () => {
    const s = server([invalid]);
    const a = new Auth('https://x/exec', 'cid', s.fetchImpl);
    const el = document.createElement('div');
    await a.mountButton(el);
    const first = cfg;
    first?.callback({ credential: 't1' });
    await flush();
    first?.callback({ credential: 't2' }); // старый callback с потраченным N1
    await flush();
    expect(s.sent.filter((x) => x.action === 'auth.login').map((x) => x.payload?.nonce)).toEqual(['N1']);
  });

  it('экран входа открыт дольше 8 мин — код обновляется; раньше — нет', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const s = server([]);
    const a = new Auth('https://x/exec', 'cid', s.fetchImpl);
    const el = document.createElement('div');
    await a.mountButton(el);
    a.keepFresh();
    await flush();
    expect(cfg?.nonce).toBe('N1');
    vi.setSystemTime(Date.now() + 5 * 60_000);
    a.keepFresh();
    await flush();
    expect(cfg?.nonce).toBe('N1');
    vi.setSystemTime(Date.now() + 3 * 60_000 + 1000);
    a.keepFresh();
    await flush();
    expect(cfg?.nonce).toBe('N2');
  });

  it('пока открыт выбор аккаунта Google, кнопку не переинициализируем (FedCM AbortError)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const s = server([{ ok: true, data: { session: 'S', expiresAt: '2099-01-01T00:00:00Z', user: { email: 'a', name: 'А', role: 'owner' } }, cursor: null }]);
    const a = new Auth('https://x/exec', 'cid', s.fetchImpl);
    const el = document.createElement('div');
    await a.mountButton(el);
    vi.setSystemTime(Date.now() + 8 * 60_000);
    a.markAttempt(); // нажала кнопку: окно Google открыто
    vi.setSystemTime(Date.now() + 60_000); // вернулась во вкладку, пока выбирает
    a.keepFresh();
    await flush();
    expect(cfg?.nonce).toBe('N1');
    expect(renders).toBe(1);
    cfg?.callback({ credential: 'tok' });
    await flush();
    expect(s.sent.filter((x) => x.action === 'auth.login').map((x) => x.payload?.nonce)).toEqual(['N1']);
    expect(a.getState().status).toBe('signedIn');
  });

  it('на экране входа нет автоматического запроса One Tap: один запрос — кнопка', async () => {
    const prompt = vi.fn();
    (window as unknown as { google: { accounts: { id: { prompt: unknown } } } }).google.accounts.id.prompt = prompt;
    const a = new Auth('https://x/exec', 'cid', server([]).fetchImpl);
    await a.mountButton(document.createElement('div'));
    expect(prompt).not.toHaveBeenCalled();
  });
});
