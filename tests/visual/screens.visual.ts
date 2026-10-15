// Визуальные снимки (Качество, 15.10.2026): каждый экран × свет / тьма × 1280 / 375 на учебном сервере — сравнение с
// эталоном; на тёмной теме — ещё поиск белых пятен (разметка + пиксели). Вход Google — заглушка GIS без сети: кнопка в
// iframe со светлым документом, как у Google (так виден белый прямоугольник при color-scheme: dark у контейнера).
import { expect, test, type Page } from '@playwright/test';
import { isDark, mockSession, prepare, settle, whiteByCss, whiteByPixels, whiteIframes } from './helpers';

/** Заглушка https://accounts.google.com/gsi/client: кнопка 320×44 в iframe (документ светлый, фон прозрачный). */
const GIS_STUB = `
window.google = { accounts: { id: {
  initialize() {}, disableAutoSelect() {}, cancel() {},
  prompt(cb) { if (cb) cb({ isSkippedMoment: () => true, isDismissedMoment: () => false, getDismissedReason: () => '' }); },
  renderButton(el) {
    const f = document.createElement('iframe');
    f.title = 'Кнопка «Войти через Google»'; f.width = '320'; f.height = '44';
    f.style.border = '0'; f.style.display = 'block';
    f.srcdoc = '<!doctype html><html><body style="margin:0;background:transparent">'
      + '<div style="height:40px;margin:2px 0;border-radius:20px;background:#1a73e8;color:#fff;font:500 14px Arial;display:grid;place-items:center">Войти с аккаунтом Google</div></body></html>';
    el.appendChild(f);
  } } } };`;

/** Белое на тёмной теме, которое так задумано (селектор — причина). Пусто: на тёмной теме белого быть не должно. */
const ALLOW_WHITE: string[] = [];

interface Screen { name: string; hash: string; login?: boolean; open?: (p: Page) => Promise<void> }
const SCREENS: Screen[] = [
  { name: 'вход', hash: '#/today', login: true },
  { name: 'сегодня', hash: '#/today' },
  { name: 'входящие', hash: '#/inbox' },
  { name: 'клиенты', hash: '#/clients' },
  // карточка открывается щелчком по строке (ui.openClient), не адресом
  { name: 'карточка-клиента', hash: '#/clients', open: async (p) => { await p.getByText('Вербицький Андрій Олегович').first().click(); } },
  { name: 'сроки', hash: '#/deadlines' },
  { name: 'платежи', hash: '#/payments' },
  { name: 'задачи', hash: '#/tasks' },
  { name: 'ключи', hash: '#/keys' },
  { name: 'справочник', hash: '#/reference' },
  { name: 'ещё', hash: '#/more' },
  { name: 'палитра-команд', hash: '#/today', open: async (p) => { await p.keyboard.press('Control+KeyK'); } },
];

/** Сломать вид для --самопроверки (VISUAL_BREAK): каждая поломка обязана дать отличие или белое пятно. */
const BREAK = process.env.VISUAL_BREAK || '';
const BREAK_CSS: Record<string, string> = {
  // причина белого прямоугольника у кнопки Google (15.10): контейнер кнопки в тёмной схеме
  'white-login': '.login__button { color-scheme: dark !important; }',
  'shift-8px': 'main, .login { padding-top: 8px !important; }',
  'button-color': 'button { background-color: #c0392b !important; }',
};

let session: unknown = null;
test.beforeAll(async ({ request }) => { session = await mockSession(request); });

for (const s of SCREENS) {
  test(s.name, async ({ page }, info) => {
    const t0 = Date.now();
    const lap = (what: string) => { if (process.env.VISUAL_TIMING) console.log(`  ${s.name} ${info.project.name}: ${what} ${Date.now() - t0} мс`); };
    // без сети: всё внешнее — отказ, кроме заглушки GIS (Playwright проверяет перехваты от последнего к первому)
    await page.route(/^https:\/\//, (r) => r.abort());
    // Настройки сайта — только учебный сервер: в public/config.json адрес ЖИВОГО API (он перекрывает адрес dev:mock),
    // снимки не должны ходить в таблицу мамы ни при каких условиях. features — всё, что умеет учебный сервер.
    const cfg = JSON.stringify({ apiUrl: 'http://localhost:5179/mock-api', features: ['inbox', 'remindPreview'] });
    await page.route(/\/config(\.local)?\.json(\?|$)/, (r) => r.fulfill({ contentType: 'application/json', body: cfg }));
    await page.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'text/javascript', body: GIS_STUB }));
    await prepare(page, info, s.login ? null : session);
    // Поломка — с начала загрузки: Chrome решает, заливать ли iframe кнопки Google, когда тот загружается; CSS после
    // загрузки страницы (addStyleTag) уже нарисованное окошко не перекрашивает.
    if (BREAK_CSS[BREAK]) {
      await page.addInitScript((css) => {
        document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); });
      }, BREAK_CSS[BREAK]);
    }
    await page.goto('/' + s.hash);
    lap('загружен');
    await settle(page);
    lap('дорисован');
    if (s.open) { await s.open(page); await settle(page); }
    if (process.env.VISUAL_SHOT) await page.screenshot({ path: `tests/visual/.out/shot-${s.name}-${info.project.name}${BREAK ? '-' + BREAK : ''}.png` });

    const problems: string[] = [];
    if (isDark(info)) {
      const spots = [...await whiteByCss(page, ALLOW_WHITE), ...await whiteByPixels(page), ...await whiteIframes(page)];
      spots.forEach((w) => problems.push(`белое пятно (${w.how}) ${w.w}×${w.h} в (${w.x},${w.y}): ${w.where}`));
      lap('пятна');
    }
    await expect.soft(page, 'отличие от эталона').toHaveScreenshot(`${s.name}.png`, { fullPage: false });
    lap('снимок');
    expect(problems, 'белые пятна на тёмной теме').toEqual([]);
  });
}
