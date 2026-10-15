// Вход через Google (контракт, раздел 3): одноразовый nonce от сервера → ID-токен Google Identity Services →
// auth.login → свой сеанс сервера на 12 ч. Сеанс живёт в памяти и sessionStorage (не localStorage): закрыла вкладку —
// при следующем открытии тихий вход. ID-токен никуда не сохраняется.
// Справка GIS: https://developers.google.com/identity/gsi/web/reference/js-reference
import { ApiError, call } from './transport';
import { clearSnap } from './snapCache';

export interface User { email: string; name: string; role: 'mama' | 'owner' }
/** signingIn — Google ответил, таблица проверяет вход (3+ с): экран входа пишет «Входим…» (п. 41). */
export interface AuthState { status: 'unknown' | 'signedOut' | 'signingIn' | 'signedIn'; user: User | null; error: string | null }

interface Stored { session: string; expiresAt: string; user: User }
interface Gis {
  initialize(cfg: Record<string, unknown>): void;
  prompt(listener?: (n: { isSkippedMoment(): boolean; isDismissedMoment(): boolean; getDismissedReason(): string }) => void): void;
  renderButton(el: HTMLElement, cfg: Record<string, unknown>): void;
  disableAutoSelect(): void;
  cancel(): void;
}

const KEY = 'buh.session';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const SILENT_MS = 15_000;
/** nonce на сервере живёт 10 мин (v5.63): экран входа берёт новый через 8 мин — только если вход сейчас не идёт. */
const REARM_MS = 8 * 60_000;
/** После нажатия кнопки Google (окно выбора аккаунта открыто) код не трогаем столько, сколько длится выбор. */
const ATTEMPT_MS = 3 * 60_000;

function gis(): Gis | undefined {
  return (window as unknown as { google?: { accounts?: { id?: Gis } } }).google?.accounts?.id;
}

let gisLoading: Promise<Gis> | null = null;
function loadGis(): Promise<Gis> {
  const ready = gis();
  if (ready) return Promise.resolve(ready);
  gisLoading ??= new Promise<Gis>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => { const g = gis(); if (g) resolve(g); else reject(new Error('GIS')); };
    s.onerror = () => { gisLoading = null; reject(new ApiError({ code: 'NETWORK', message: 'Не загрузился вход Google — проверьте связь' })); };
    document.head.appendChild(s);
  });
  return gisLoading;
}

function readStored(): Stored | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    const s = raw ? JSON.parse(raw) as Stored : null;
    return s && Date.parse(s.expiresAt) > Date.now() ? s : null;
  } catch {
    return null;
  }
}

/** Понятный маме текст по коду отказа входа. */
function loginMessage(e: unknown): string {
  if (!(e instanceof ApiError)) return 'Нажмите кнопку «Войти через Google» ещё раз';
  if (e.code === 'FORBIDDEN') return 'У этого аккаунта Google нет доступа к кабинету. Войдите тем аккаунтом, который дал Дмитрий.';
  if (e.code === 'RATE_LIMIT') return 'Слишком много попыток входа — попробуйте через час';
  if (e.code === 'NETWORK') return 'Нет связи — проверьте интернет и попробуйте ещё раз';
  // Чаще всего — устаревший одноразовый код входа: кнопка уже обновлена, повтор пройдёт.
  if (e.code === 'AUTH_INVALID') return 'Вход не прошёл — нажмите кнопку «Войти через Google» ещё раз';
  return e.message || 'Не получилось войти — попробуйте ещё раз';
}

export class Auth {
  private stored: Stored | null = readStored();
  private state: AuthState = this.stored ? { status: 'signedIn', user: this.stored.user, error: null } : { status: 'signedOut', user: null, error: null };
  private listeners = new Set<() => void>();
  private pending: { resolve: (s: string) => void; reject: (e: unknown) => void } | null = null;

  constructor(private readonly url: string, private readonly clientId: string, private readonly fetchImpl: typeof fetch = (...a) => fetch(...a)) {}

  getState = (): AuthState => this.state;
  subscribe = (fn: () => void): (() => void) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  session = (): string | null => this.stored?.session ?? null;

  private set(next: AuthState) { this.state = next; for (const fn of this.listeners) fn(); }

  private armedAt = 0;
  /** Одноразовые коды входа, уже отправленные серверу: второй раз тот же не уходит никогда. */
  private usedNonces = new Set<string>();
  private buttonEl: HTMLElement | null = null;
  private arming: Promise<void> | null = null;
  /** Когда мама нажала кнопку Google: пока идёт выбор аккаунта, GIS не переинициализируем — новый initialize
   *  отменяет открытый запрос FedCM (AbortError, 15.10.2026). 0 — вход сейчас не идёт. */
  private attemptAt = 0;

  /** Вход идёт: нажата кнопка (окно Google открыто) и ответа ещё нет. */
  signingIn(now = Date.now()): boolean {
    return this.attemptAt > 0 && now - this.attemptAt < ATTEMPT_MS;
  }

  /** Нажатие кнопки Google. Кнопка — iframe Google, её щелчок виден странице как уход фокуса со страницы (blur). */
  markAttempt(): void {
    if (this.buttonEl) { this.attemptAt = Date.now(); if (this.state.error) this.set({ ...this.state, error: null }); }
  }

  /** Новый nonce и настройка GIS под него: initialize помнит только последний вызов, поэтому — перед каждой попыткой. */
  private async arm(): Promise<Gis> {
    const g = await loadGis();
    const env = await call<{ nonce: string }>({ url: this.url, action: 'auth.nonce', fetchImpl: this.fetchImpl });
    const nonce = env.data.nonce;
    g.initialize({
      client_id: this.clientId,
      nonce,
      auto_select: true,
      cancel_on_tap_outside: false,
      context: 'signin',
      itp_support: true,
      callback: (r: { credential?: string }) => {
        if (this.usedNonces.has(nonce)) {
          // Кнопка не успела обновиться, а код уже потрачен: не отправляем, берём новый.
          this.set({ ...this.state, error: 'Нажмите кнопку «Войти через Google» ещё раз' });
          void this.rearm();
          return;
        }
        this.usedNonces.add(nonce);
        this.attemptAt = 0;
        void this.finish(r.credential ?? '', nonce);
      },
    });
    this.armedAt = Date.now();
    return g;
  }

  /** Свежий код входа и кнопка заново (если экран входа на месте). Параллельные вызовы сливаются в один.
   *  prompt — только для тихого входа; на экране входа один запрос — кнопка (два запроса FedCM гасят друг друга). */
  private rearm(prompt = false): Promise<void> {
    this.arming ??= (async () => {
      try {
        const g = await this.arm();
        if (this.buttonEl) {
          this.buttonEl.replaceChildren();
          g.renderButton(this.buttonEl, { type: 'standard', theme: 'filled_blue', size: 'large', text: 'signin_with', shape: 'pill', locale: 'ru', width: '320' });
        }
        if (prompt) g.prompt();
      } catch (e) {
        this.set({ ...this.state, error: loginMessage(e) });
      } finally {
        this.arming = null;
      }
    })();
    return this.arming;
  }

  private async finish(idToken: string, nonce: string) {
    const waiting = this.pending;
    this.pending = null;
    if (this.buttonEl) this.set({ status: 'signingIn', user: null, error: null });
    try {
      const env = await call<Stored>({ url: this.url, action: 'auth.login', payload: { idToken, nonce }, fetchImpl: this.fetchImpl });
      this.stored = env.data;
      try { sessionStorage.setItem(KEY, JSON.stringify(env.data)); } catch { /* приватное окно — сеанс останется в памяти */ }
      this.set({ status: 'signedIn', user: env.data.user, error: null });
      waiting?.resolve(env.data.session);
    } catch (e) {
      // Код отказа — в консоль (без токена и почты): по нему видно, что именно не прошло.
      console.warn('Вход: отказ', e instanceof ApiError ? e.code : e instanceof Error ? e.name : 'unknown');
      this.signOutLocal(loginMessage(e));
      waiting?.reject(e);
      // Код потрачен (или устарел) — сразу новый, чтобы следующее нажатие прошло.
      if (this.buttonEl) void this.rearm();
    }
  }

  /** Кнопка «Войти через Google» в указанном месте экрана входа. Повторный вызов для того же места (React
   *  в разработке запускает эффекты дважды) не открывает второй запрос: FedCM допускает только один за раз. */
  mountButton(el: HTMLElement): Promise<void> {
    if (this.buttonEl === el && (this.arming || Date.now() - this.armedAt < REARM_MS)) return this.arming ?? Promise.resolve();
    this.buttonEl = el;
    return this.rearm();
  }

  /** Экран входа ушёл — кнопку больше не перерисовываем. */
  unmountButton(el: HTMLElement): void {
    if (this.buttonEl === el) this.buttonEl = null;
  }

  /** Пока виден экран входа и вход не идёт: код старше 8 мин — взять новый (сервер держит его 10 мин). */
  keepFresh(): void {
    if (this.buttonEl && !this.arming && !this.signingIn() && Date.now() - this.armedAt >= REARM_MS) void this.rearm();
  }

  /** Тихий вход, когда сеанс истёк посреди работы. Не вышло за 15 с — экран входа. */
  refresh = async (): Promise<string> => {
    this.stored = null;
    const g = await this.arm();
    return new Promise<string>((resolve, reject) => {
      const fail = () => {
        if (!this.pending) return;
        this.pending = null;
        this.signOutLocal(null);
        reject(new ApiError({ code: 'AUTH_REQUIRED', message: 'Войдите, чтобы продолжить' }));
      };
      this.pending = { resolve, reject };
      setTimeout(fail, SILENT_MS);
      g.prompt((n) => { if (n.isSkippedMoment() || n.isDismissedMoment()) fail(); });
    });
  };

  private signOutLocal(error: string | null) {
    this.stored = null;
    clearSnap(); // данные клиентов этой вкладки — вместе с сеансом
    try { sessionStorage.removeItem(KEY); } catch { /* нечего чистить */ }
    this.set({ status: 'signedOut', user: null, error });
  }

  signOut(): void {
    gis()?.disableAutoSelect();
    this.signOutLocal(null);
  }
}
