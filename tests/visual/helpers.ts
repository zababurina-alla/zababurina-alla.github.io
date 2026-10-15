// Помощники визуальных снимков: вход на учебном сервере без окна Google, тема, часы, ожидание загрузки, поиск белых
// пятен на тёмной теме (по разметке и по пикселям снимка).
import type { APIRequestContext, Page, TestInfo } from '@playwright/test';

export const QA_EMAIL = 'qa-visual@example.invalid';
/** «Сейчас» для браузера — как у учебного сервера (fixed-date.mjs): выдуманные данные рассчитаны на 14.10.2026. */
export const NOW = new Date('2026-10-14T10:00:00+03:00');
/** Белое пятно — область больше SPOT × SPOT px (кнопка Google — 44 px в высоту). */
export const SPOT = 24;
/** «Почти белый» — каждый канал не меньше этого (фон #f0f0f0 и светлее). */
export const WHITE = 240;

export const isDark = (info: TestInfo) => info.project.name.startsWith('dark');

/** Сеанс учебного сервера: idToken «mock:почта» (scripts/mock-api.ts) — то же, что сайт кладёт в localStorage. */
export async function mockSession(request: APIRequestContext): Promise<unknown> {
  const post = async (body: unknown) => (await request.post('/mock-api', { data: JSON.stringify(body), headers: { 'Content-Type': 'text/plain' } })).json();
  const n = await post({ v: 1, action: 'auth.nonce' });
  const r = await post({ v: 1, action: 'auth.login', payload: { idToken: `mock:${QA_EMAIL}`, nonce: n.data.nonce } });
  if (!r.ok) throw new Error('учебный вход не прошёл: ' + JSON.stringify(r.error));
  return r.data;
}

/** До загрузки страницы: тема (data-theme + localStorage сайта), сеанс (или его нет — экран входа), часы. */
export async function prepare(page: Page, info: TestInfo, session: unknown | null): Promise<void> {
  const theme = isDark(info) ? 'dark' : 'light';
  await page.addInitScript(([t, s]) => {
    try {
      localStorage.setItem('sverka.theme', t as string);
      if (s) localStorage.setItem('buh.session', JSON.stringify(s)); else localStorage.removeItem('buh.session');
      sessionStorage.clear();
    } catch { /* приватное окно — тема из colorScheme */ }
    document.documentElement.dataset.theme = t as string;
  }, [theme, session] as const);
  await page.clock.setFixedTime(NOW);
}

/** Экран дорисован: сеть затихла, шрифты загружены, нет полосы загрузки и скелетонов. */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"], .skeleton, .load-progress'), undefined, { timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(300); // последний кадр после смены экрана
}

export interface WhiteSpot { how: 'разметка' | 'пиксели'; where: string; w: number; h: number; x: number; y: number }

/**
 * Разметка: видимые элементы с непрозрачным почти белым фоном больше SPOT × SPOT. allow — селекторы, где белое
 * разрешено (с причиной в спеке). iframe внутрь не видит — для этого пиксели.
 */
export async function whiteByCss(page: Page, allow: string[]): Promise<WhiteSpot[]> {
  return page.evaluate(([spot, white, allowSel]) => {
    const out: WhiteSpot[] = [];
    const allowed = (el: Element) => (allowSel as string[]).some((s) => el.closest(s));
    const path = (el: Element) => {
      const parts: string[] = [];
      for (let e: Element | null = el; e && parts.length < 4; e = e.parentElement) {
        parts.unshift(e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.classList.length ? '.' + [...e.classList].slice(0, 2).join('.') : ''));
      }
      return parts.join(' > ');
    };
    document.querySelectorAll('body *').forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return;
      const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(cs.backgroundColor);
      if (!m) return;
      const a = m[4] === undefined ? 1 : Number(m[4]);
      if (a < 0.9 || Number(m[1]) < (white as number) || Number(m[2]) < (white as number) || Number(m[3]) < (white as number)) return;
      const r = el.getBoundingClientRect();
      if (r.width < (spot as number) || r.height < (spot as number) || allowed(el)) return;
      out.push({ how: 'разметка', where: path(el), w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) });
    });
    return out;
  }, [SPOT, WHITE, allow] as const);
}

/**
 * Пиксели: снимок окна → связные области почти белых пикселей больше SPOT × SPOT (рамка области). allowRects — где
 * белое разрешено. Видит всё, что видит человек: iframe Google, картинки, тени.
 */
export async function whiteByPixels(page: Page, allowRects: { x: number; y: number; w: number; h: number }[] = []): Promise<WhiteSpot[]> {
  const png = (await page.screenshot({ animations: 'disabled', caret: 'hide', scale: 'css' })).toString('base64');
  const probe = await page.context().newPage();
  try {
    return await probe.evaluate(async ([data, spot, white, allowR]) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + data;
      await img.decode();
      const W = img.naturalWidth, H = img.naturalHeight;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const px = ctx.getImageData(0, 0, W, H).data;
      const seen = new Uint8Array(W * H);
      const isW = (i: number) => px[i * 4] >= (white as number) && px[i * 4 + 1] >= (white as number) && px[i * 4 + 2] >= (white as number);
      const out: WhiteSpot[] = [];
      const stack: number[] = [];
      for (let p = 0; p < W * H; p++) {
        if (seen[p] || !isW(p)) continue;
        let x0 = W, y0 = H, x1 = 0, y1 = 0, n = 0;
        stack.push(p); seen[p] = 1;
        while (stack.length) {
          const q = stack.pop()!;
          const x = q % W, y = (q - x) / W;
          n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          const nb = [x > 0 ? q - 1 : -1, x < W - 1 ? q + 1 : -1, y > 0 ? q - W : -1, y < H - 1 ? q + W : -1];
          for (const r of nb) if (r >= 0 && !seen[r] && isW(r)) { seen[r] = 1; stack.push(r); }
        }
        const w = x1 - x0 + 1, h = y1 - y0 + 1;
        // область заметная: рамка больше SPOT × SPOT и заполнена белым хотя бы на треть (не тонкая линия вокруг)
        if (w < (spot as number) || h < (spot as number) || n < (w * h) / 3) continue;
        const inAllowed = (allowR as { x: number; y: number; w: number; h: number }[]).some((a) => x0 >= a.x && y0 >= a.y && x1 <= a.x + a.w && y1 <= a.y + a.h);
        if (!inAllowed) out.push({ how: 'пиксели', where: `область ${w}×${h}`, w, h, x: x0, y: y0 });
      }
      return out;
    }, [png, SPOT, WHITE, allowRects] as const);
  } finally {
    await probe.close();
  }
}
