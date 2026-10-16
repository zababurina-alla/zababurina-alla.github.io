// Вход через Google (контракт, раздел 3): одноразовый nonce от сервера → ID-токен Google Identity Services →
// auth.login → свой сеанс сервера на 12 ч. Сеанс сервера (и только он — не ID-токен Google и не данные клиентов) живёт
// в localStorage до своего срока: приложение на телефоне не просит входить при каждом открытии (решение владельца
// 15.10.2026, вариант «б»). «Выйти», отказ сервера (AUTH_REQUIRED) или истёкший срок — стирают. Отозвать все сеансы —
// на сервере (apiRevokeAllSessions). Снимок таблицы — отдельно и только в sessionStorage (snapCache.ts).
// Справка GIS: https://developers.google.com/identity/gsi/web/reference/js-reference
import { ApiError, call } from './transport';
import type { Envelope } from './transport';
import { clearSnap } from './snapCache';
import { getTheme } from '../lib/theme';

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
/** nonce на сервере живёт 20 мин (координатор 16.10): новый берём за 2 мин до конца — только если вход сейчас не идёт. */
const REARM_MS = 18 * 60_000;
/** Ответ Google на код старше этого на сервер не отправляем: тот откажет «nonce просрочен» (diag 15.10, 17:42). */
const NONCE_SAFE_MS = 19.5 * 60_000;
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
    sessionStorage.removeItem(KEY); // сеанс прежних сборок жил здесь
    const raw = localStorage.getItem(KEY);
    const s = raw ? JSON.parse(raw) as Stored : null;
    if (s && Date.parse(s.expiresAt) > Date.now()) return s;
    if (raw) localStorage.removeItem(KEY); // истёк — не держим
    return null;
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
  // Причина от сервера — в скобках: по ней видно, что именно не прошло (код входа устарел, не тот аккаунт…).
  if (e.code === 'AUTH_INVALID') return `Вход не прошёл${e.message ? ` (${e.message})` : ''} — нажмите кнопку «Войти через Google» ещё раз`;
  return e.message || 'Не получилось войти — попробуйте ещё раз';
}

// Холодный старт Apps Script до нашего кода — 13–15 с (живой домен 16.10: 13,8 с; два раза по 15 с не успели), иногда 30+ с.
const NONCE_TIMEOUT_MS = 22_000;
const NONCE_TRIES = 3;

export class Auth {
  private stored: Stored | null = readStored();
  private state: AuthState = this.stored ? { status: 'signedIn', user: this.stored.user, error: null } : { status: 'signedOut', user: null, error: null };
  private listeners = new Set<() => void>();
  private pending: { resolve: (s: string) => void; reject: (e: unknown) => void } | null = null;

  constructor(private readonly url: string, private readonly clientId: string, private readonly fetchImpl: typeof fetch = (...a) => fetch(...a)) {
    // Сеанса нет (истёк, вышла, перенос сеанса из старых сборок) — снимок с данными клиентов не держим на экране входа.
    if (!this.stored) clearSnap();
  }

  getState = (): AuthState => this.state;
  subscribe = (fn: () => void): (() => void) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  session = (): string | null => this.stored?.session ?? null;

  private set(next: AuthState) { this.state = next; for (const fn of this.listeners) fn(); }

  private armedAt = 0;
  /** Сколько раз брали код входа (для диагностики в консоли). */
  private arms = 0;
  /** Одноразовые коды входа, уже отправленные серверу: второй раз тот же не уходит никогда. */
  private usedNonces = new Set<string>();
  private buttonEl: HTMLElement | null = null;
  private arming: Promise<void> | null = null;
  /** Когда мама нажала кнопку Google: пока идёт выбор аккаунта, GIS не переинициализируем — новый initialize
   *  отменяет открытый запрос FedCM (AbortError, 15.10.2026). 0 — вход сейчас не идёт. */
  private attemptAt = 0;
  /** Код входа, взятый заранее (в фоне при открытии страницы): первый auth.nonce — холодный старт Apps Script, 5–30 с. */
  private ready: { nonce: string; at: number } | null = null;
  private fetching: Promise<{ nonce: string; at: number }> | null = null;

  /** Вход идёт: нажата кнопка (окно Google открыто) и ответа ещё нет. */
  signingIn(now = Date.now()): boolean {
    return this.attemptAt > 0 && now - this.attemptAt < ATTEMPT_MS;
  }

  /** Нажатие кнопки Google. Кнопка — iframe Google, её щелчок виден странице как уход фокуса со страницы (blur). */
  markAttempt(): void {
    if (this.buttonEl) { this.attemptAt = Date.now(); if (this.state.error) this.set({ ...this.state, error: null }); }
  }

  /** Взять код входа заранее (session.ts — при открытии страницы без сеанса). Параллельные вызовы сливаются в один.
   *  Код иногда отвечает 30 с и обрывается (холодный старт Apps Script, 16.10: 2 из 5 открытий; следующая попытка — 5 с):
   *  до 3 попыток по 22 с, «нет связи» — только после третьей. */
  prefetchNonce(): Promise<{ nonce: string; at: number }> {
    if (this.fetching) return this.fetching;
    const p = (async () => {
      let env: Envelope<{ nonce: string }> | null = null;
      for (let attempt = 1; !env; attempt++) {
        try {
          env = await call<{ nonce: string }>({ url: this.url, action: 'auth.nonce', fetchImpl: this.fetchImpl, timeoutMs: NONCE_TIMEOUT_MS });
        } catch (e) {
          if (attempt >= NONCE_TRIES || !(e instanceof ApiError) || e.code !== 'NETWORK') throw e;
          console.info(`Вход: код входа не пришёл (попытка ${attempt}), прошу ещё раз`);
        }
      }
      const r = { nonce: env.data.nonce, at: Date.now() };
      this.ready = r;
      return r;
    })();
    this.fetching = p;
    void p.then(() => undefined, () => undefined).finally(() => { if (this.fetching === p) this.fetching = null; });
    return p;
  }

  /** Готовый неистраченный код не старше REARM_MS — сразу, иначе — новый. */
  private freshNonce(maxAge = REARM_MS): Promise<{ nonce: string; at: number }> {
    const r = this.ready;
    if (r && !this.usedNonces.has(r.nonce) && Date.now() - r.at < maxAge) return Promise.resolve(r);
    this.ready = null;
    return this.prefetchNonce();
  }

  /** Код в руках (не старый и не истраченный)? Тогда кнопка сразу настоящая, без заглушки. */
  private hasFreshNonce(): boolean {
    const r = this.ready;
    return Boolean(r && !this.usedNonces.has(r.nonce) && Date.now() - r.at < REARM_MS);
  }

  /** Кнопка Google сразу, пока код входа ещё идёт (вариант «а» координатора, 16.10): нажатие до кода даёт токен без
   *  нашего кода — его не отправляем, просим нажать ещё раз (к этому времени кнопка уже настоящая). */
  private placeholder(g: Gis): void {
    g.initialize({
      client_id: this.clientId,
      auto_select: false,
      cancel_on_tap_outside: false,
      context: 'signin',
      itp_support: true,
      callback: () => {
        this.attemptAt = 0;
        console.info('Вход: нажали до кода входа — токен не отправляю');
        this.set({ ...this.state, error: 'Секунду — готовлю вход. Нажмите «Войти через Google» ещё раз' });
        void this.rearm();
      },
    });
  }

  /** Новый nonce и настройка GIS под него: initialize помнит только последний вызов, поэтому — перед каждой попыткой. */
  private async arm(maxAge = REARM_MS): Promise<Gis> {
    const g = await loadGis();
    const got = await this.freshNonce(maxAge);
    const nonce = got.nonce;
    const issuedAt = got.at;
    this.arms += 1;
    const no = this.arms;
    // Диагностика входа — без кода входа, токена и почты: номер выдачи и возраст кода.
    console.info(`Вход: код входа №${no} получен`);
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
        const age = Date.now() - issuedAt;
        console.info(`Вход: Google ответил (код №${no}, выдан ${Math.round(age / 1000)} с назад${r.credential ? '' : ', без токена'})`);
        if (age > NONCE_SAFE_MS) {
          // Кнопка провисела дольше жизни кода (вкладка в фоне): не тратим попытку на заведомый отказ.
          this.attemptAt = 0;
          this.set({ ...this.state, error: 'Кнопка входа устарела — обновил её, нажмите «Войти через Google» ещё раз' });
          void this.rearm();
          return;
        }
        this.usedNonces.add(nonce);
        this.ready = null;
        this.attemptAt = 0;
        void this.finish(r.credential ?? '', nonce);
      },
    });
    this.armedAt = Date.now();
    return g;
  }

  /** Свежий код входа и кнопка заново (если экран входа на месте). Параллельные вызовы сливаются в один.
   *  prompt — только для тихого входа; на экране входа один запрос — кнопка (два запроса FedCM гасят друг друга). */
  private rearm(prompt = false, maxAge = REARM_MS): Promise<void> {
    this.arming ??= (async () => {
      try {
        // Кода ещё нет (первый auth.nonce — холодный старт) — кнопка сразу, заглушкой; настоящая — когда код придёт.
        // Только на пустом месте: уже нарисованная кнопка (код истрачен или устарел) остаётся — её нажатие само
        // попросит нажать ещё раз, а заглушка поверх неё лишь мигнула бы.
        if (this.buttonEl && !this.buttonEl.hasChildNodes() && !this.hasFreshNonce()) {
          const g0 = await loadGis();
          if (this.buttonEl && !this.buttonEl.hasChildNodes() && !this.hasFreshNonce()) { this.placeholder(g0); this.render(g0); }
        }
        const g = await this.arm(maxAge);
        // Мама уже нажала заглушку и выбирает аккаунт — новый initialize оборвал бы окно Google (FedCM AbortError);
        // её ответ придёт в заглушку, та попросит нажать ещё раз и перерисует кнопку.
        if (this.buttonEl && !this.signingIn()) this.render(g);
        if (prompt) g.prompt();
      } catch (e) {
        this.set({ ...this.state, error: loginMessage(e) });
      } finally {
        this.arming = null;
      }
    })();
    return this.arming;
  }

  private render(g: Gis): void {
    if (!this.buttonEl) return;
    this.buttonEl.replaceChildren();
    // Тёмная тема — тёмная кнопка Google: синяя в белой рамке iframe выглядела белым пятном (отдел «Качество»).
    g.renderButton(this.buttonEl, { type: 'standard', theme: getTheme() === 'dark' ? 'filled_black' : 'filled_blue', size: 'large', text: 'signin_with', shape: 'pill', locale: 'ru', width: String(Math.min(320, this.buttonEl.clientWidth || 320)) }); // на 360 px не шире карточки
  }

  private async finish(idToken: string, nonce: string) {
    const waiting = this.pending;
    this.pending = null;
    if (this.buttonEl) this.set({ status: 'signingIn', user: null, error: null });
    try {
      const env = await call<Stored>({ url: this.url, action: 'auth.login', payload: { idToken, nonce }, fetchImpl: this.fetchImpl });
      this.stored = env.data;
      try { localStorage.setItem(KEY, JSON.stringify(env.data)); } catch { /* приватное окно — сеанс останется в памяти */ }
      this.set({ status: 'signedIn', user: env.data.user, error: null });
      waiting?.resolve(env.data.session);
    } catch (e) {
      // Код отказа — в консоль (без токена и почты): по нему видно, что именно не прошло.
      console.warn('Вход: отказ', e instanceof ApiError ? `${e.code}: ${e.message}` : e instanceof Error ? e.name : 'unknown');
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

  /** Пока открыт экран входа и вход не идёт: код старше maxAge (18 мин) — взять новый (сервер держит его 20 мин).
   *  Зовётся и в фоновой вкладке: кнопка не должна дожидаться маму с кодом, который сервер уже не примет. */
  keepFresh(maxAge = REARM_MS): void {
    if (this.buttonEl && !this.arming && !this.signingIn() && Date.now() - this.armedAt >= maxAge) void this.rearm(false, maxAge);
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
    try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch { /* нечего чистить */ }
    this.set({ status: 'signedOut', user: null, error });
  }

  signOut(): void {
    // Сервер отзывает сеанс (auth.logout, аудит M7): токен берём до стирания у себя. Ответ не ждём — «Выйти» мгновенное,
    // а без связи токен всё равно истечёт сам (12 ч).
    const session = this.stored?.session;
    if (session) void call({ url: this.url, action: 'auth.logout', session, fetchImpl: this.fetchImpl, timeoutMs: 8000 }).catch(() => undefined);
    gis()?.disableAutoSelect();
    this.signOutLocal(null);
  }
}
