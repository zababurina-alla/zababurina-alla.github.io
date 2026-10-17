// Автопроверка вёрстки (владелец, 16.10: «в следующий раз число должно ловить само, а не владелец»).
// Каждый экран, окно и всплывающий список × 1280 / 1024 / 375 × светлая / тёмная — четыре числа:
//   пустоты    — пустые области больше 200×200 px внутри контента;
//   высоты     — ряды, где соседние карточки / кнопки разной высоты (> 4 px);
//   колесо     — блоки с прокруткой, которые не крутятся колесом мыши;
//   подписи    — кнопки, фишки, метки, заголовки колонок, у которых текст перенёсся или обрезан без многоточия.
// Печать (--print): экраны на листе A4 — обрезанные подписи, пустая ширина справа в % (по строкам таблиц), листов.
// Отдельно (--checks): лента чата крутится колесом (1280, 1024); кнопки ленты не под краем окна (1280×800, 1024×768);
// два уведомления подряд — кнопки обоих нажимаются.
// Запуск: node scripts/layout-audit.mjs [адрес] [--json путь] [--only сегодня,клиенты] [--strict] [--print | --checks]
//   адрес — по умолчанию учебный режим локального сайта http://localhost:5183/ (?demo=1 добавляется сам).
//   --strict — код выхода 1, если хоть одно число больше нуля (для проверок перед сдачей).
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const BASE = args.find((a) => /^https?:/.test(a)) ?? 'http://localhost:5183/';
const ONLY = flag('--only')?.split(',');
const JSON_OUT = flag('--json');
const STRICT = args.includes('--strict');
const PRINT = args.includes('--print');
const CHECKS = args.includes('--checks');

// Экраны, которые печатают (или могут): A4, поля 14 × 12 мм — как в print.css
const PRINT_SCREENS = [
  { name: 'сроки', hash: '#/deadlines' },
  { name: 'сегодня', hash: '#/today' },
  { name: 'платежи', hash: '#/payments' },
  { name: 'задачи', hash: '#/tasks' },
  { name: 'клиенты', hash: '#/clients' },
  { name: 'карточка', hash: '#/clients', open: (p) => p.locator('.ctable__row .ctable__open').first().click() },
  { name: 'ключи', hash: '#/keys' },
  { name: 'месяц', hash: '#/month' },
  { name: 'входящие', hash: '#/inbox' },
];

/** На листе: обрезанные подписи и пустая ширина справа (медиана по строкам таблиц и списков). */
function measurePrint() {
  const W = document.documentElement.clientWidth;
  const visible = (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
  const label = (el) => (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : el.tagName.toLowerCase()) + ' «' + (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30) + '»';
  const clippedList = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || el.children.length > 3 || !(el.textContent || '').trim() || el.closest('.visually-hidden')) continue;
    const cs = getComputedStyle(el);
    if (cs.overflowX === 'visible' && cs.textOverflow !== 'ellipsis') continue;
    if (el.scrollWidth > el.clientWidth + 1) clippedList.push(`${label(el)} — ${cs.textOverflow === 'ellipsis' ? 'многоточие' : 'обрезано'}`);
  }
  const rights = [];
  for (const row of document.querySelectorAll('.dtable__row, .ctable__row, .paylist__row, .tasks__row, .mini__row, .feed__item, .kgrid__row, .mcheck__row, li')) {
    if (!visible(row)) continue;
    let maxR = -Infinity;
    const tw = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (!n.textContent.trim() || !n.parentElement || !visible(n.parentElement)) continue;
      const rg = document.createRange(); rg.selectNodeContents(n); for (const r of rg.getClientRects()) if (r.width > 0) maxR = Math.max(maxR, r.right);
    }
    if (maxR > -Infinity) rights.push(maxR);
  }
  rights.sort((a, b) => a - b);
  const median = rights.length ? rights[Math.floor(rights.length / 2)] : W;
  // Интерфейс на бумаге: поля ввода, кнопки, тёмные плашки (светлота фона < 0,5), полоса прокрутки, лист шире страницы
  const uiList = [];
  // Кнопки-кнопки и поля ввода; имя клиента-ссылка и галочка «Месяца» — это данные, их печатать надо
  for (const el of document.querySelectorAll('.btn, .icon-btn, .chip, .seg__opt, .tabs__tab, .check-btn, input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select')) {
    if (visible(el) && !el.closest('.visually-hidden')) uiList.push(`${label(el)} — ${/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) ? 'поле' : 'кнопка'}`);
  }
  const lum = (c) => { const m = c.match(/[\d.]+/g); if (!m || (m[3] !== undefined && Number(m[3]) < 0.5)) return 1; const [r, g, b] = m.map(Number); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 60 || r.height < 24) continue;
    if (lum(getComputedStyle(el).backgroundColor) < 0.5) uiList.push(`${label(el)} — тёмная плашка`);
  }
  const over = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  if (over > 1) uiList.push(`лист шире страницы на ${over} px`);
  // Текст за правым краем листа («просрочено 24 д…» срезано краем, Р-6)
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let edge = 0;
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    if (!n.textContent.trim() || !n.parentElement || !visible(n.parentElement)) continue;
    const rg = document.createRange(); rg.selectNodeContents(n);
    if ([...rg.getClientRects()].some((q) => q.width > 0 && q.right > W + 1)) edge++;
  }
  if (edge) uiList.push(`текст за краем листа: ${edge}`);
  // По слову в строке на бумаге («Задачи на сегодня» столбиком, Г-4) — считается вместе с обрезанными
  for (const el of document.querySelectorAll('body span, body strong, body p, body a, body li')) {
    if (!visible(el) || el.children.length) continue;
    const text = (el.textContent || '').trim().replace(/\s+/g, ' ');
    const words = text.split(' ');
    const width = el.getBoundingClientRect().width;
    if (words.length < 2 || words.length > 5 || text.length > 30 || (words.length < 3 && width >= 90)) continue;
    const rg = document.createRange(); rg.selectNodeContents(el);
    const tops = new Set([...rg.getClientRects()].filter((q) => q.width > 1).map((q) => Math.round(q.top / 3)));
    if (tops.size >= words.length) clippedList.push(`${label(el)} — по слову в строке`);
  }
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (visible(el) && /(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) uiList.push(`${label(el)} — полоса прокрутки вбок`);
  }
  return { clipped: clippedList.length, clippedList: clippedList.slice(0, 12), emptyPct: Math.max(0, Math.round((1 - median / W) * 100)), rows: rights.length, ui: uiList.length, uiList: uiList.slice(0, 12) };
}

// Отдельные проверки (--checks): лента чата «Входящих» крутится колесом (1280 и 1024); два уведомления подряд —
// у обоих кнопки нажимаются (центр кнопки не закрыт другим уведомлением), перекрытий нет (1280).
if (CHECKS) {
  const browser = await chromium.launch();
  const lines = [];
  const open = async (page, hash) => {
    await page.goto('about:blank');
    await page.goto(`${BASE}${BASE.includes('?') ? '&' : '?'}demo=1&theme=light`, { waitUntil: 'load' });
    await page.waitForTimeout(1800);
    await page.evaluate((h) => { location.hash = h; }, hash);
    await page.waitForTimeout(1200);
  };
  try {
    // ── Лента чата: каждый чат по очереди; прокручиваемая лента — крутим колесом над её серединой ──
    for (const w of [1280, 1024]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 640 } });
      const page = await ctx.newPage();
      await open(page, '#/inbox');
      const n = await page.locator('.chats__list .chat').count();
      let scrollable = 0, stuck = 0;
      for (let i = 0; i < n; i++) {
        await page.locator('.chats__list .chat').nth(i).click();
        await page.waitForTimeout(1200); // лента открывается плавной прокруткой к новым — дождаться, пока доедет
        const feed = page.locator('.dfeed').first();
        if (!(await feed.count())) continue;
        const can = await feed.evaluate((e) => e.scrollHeight > e.clientHeight + 4);
        if (!can) continue;
        scrollable++;
        // Лента открывается внизу (новые сообщения) — крутим вверх, к старым; уже вверху — вниз
        const top0 = await feed.evaluate((e) => e.scrollTop);
        const b = await feed.boundingBox();
        if (!b) continue;
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
        await page.mouse.wheel(0, top0 > 0 ? -300 : 300);
        await page.waitForTimeout(400);
        if (Math.abs((await feed.evaluate((e) => e.scrollTop)) - top0) < 1) stuck++;
      }
      lines.push(`лента чата ${w}: чатов ${n}, с прокруткой ${scrollable}, не крутится колесом ${stuck}`);
      await ctx.close();
    }
    // ── Кнопки под краем окна: лента долистана до конца, страница — тоже; кнопки внутри ниже окна — не нажать (Г-7) ──
    for (const [w, h] of [[1280, 800], [1024, 768]]) {
      const ctx2 = await browser.newContext({ viewport: { width: w, height: h } });
      const page2 = await ctx2.newPage();
      await open(page2, '#/inbox');
      const n = await page2.locator('.chats__list .chat').count();
      let below = 0, chatsWith = 0;
      for (let i = 0; i < n; i++) {
        await page2.locator('.chats__list .chat').nth(i).click();
        await page2.waitForTimeout(900);
        const k = await page2.evaluate(() => {
          const f = document.querySelector('.dfeed');
          if (!f) return 0;
          // Как человек: крутит саму ленту до конца; страницу — нет (колесо в конце ленты до неё не доходит, contain)
          window.scrollTo(0, 0);
          f.scrollTop = f.scrollHeight;
          return [...f.querySelectorAll('button, a[href]')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.bottom > window.innerHeight + 1; }).length;
        });
        below += k; if (k) chatsWith++;
      }
      lines.push(`кнопки под краем окна ${w}×${h}: чатов ${n}, с кнопками под краем ${chatsWith}, кнопок под краем ${below}`);
      await ctx2.close();
    }
    // ── Лента приподнимается над уведомлением — и после смены переписки (повторная приёмка-5, Н-5) ──
    {
      const c4 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const p4 = await c4.newPage();
      await open(p4, '#/inbox');
      const n = await p4.locator('.chats__list .chat').count();
      const res = [];
      for (let i = 0; i < n && res.length < 2; i++) {
        await p4.locator('.chats__list .chat').nth(i).click();
        await p4.waitForTimeout(900);
        const btn = p4.locator('.bubble:not(.is-new) .bubble__hide').last();
        if (!(await btn.count())) continue;
        await p4.locator('.bubble:not(.is-new)').last().hover();
        await btn.click();
        await p4.waitForFunction(() => document.querySelectorAll('body > .toasts > .toast').length > 0, null, { timeout: 5000 }).catch(() => {});
        await p4.waitForTimeout(500);
        res.push(await p4.evaluate(() => {
          const f = document.querySelector('.dfeed');
          const t = document.querySelector('body > .toasts')?.getBoundingClientRect();
          const r = f.getBoundingClientRect();
          const covers = t && t.height > 0 && t.left < r.right && t.top < r.bottom;
          return covers ? (parseFloat(f.style.getPropertyValue('--lift')) > 0 ? 'да' : 'нет') : 'не перекрывает';
        }));
        await p4.locator('body > .toasts .toast__action').first().click().catch(() => {}); // «Отменить» — вернуть как было
        await p4.waitForTimeout(400);
      }
      lines.push(`лента над уведомлением: ${res.map((r, i) => `${i + 1}-я переписка — ${r}`).join(', ') || 'решённых сообщений нет'}`);
      await c4.close();
    }
    // ── Меню целиком в окне ноутбука: ничего не уходит под нижний край (Р-4: 816 → 792 из 776 px) ──
    for (const [w, h] of [[1280, 800], [1280, 720], [1024, 768]]) {
      const c3 = await browser.newContext({ viewport: { width: w, height: h - 24 } }); // 24 px — рамка окна браузера
      const p3 = await c3.newPage();
      await open(p3, '#/today');
      const m = await p3.evaluate(() => { const r = document.querySelector('.rail'); return r && getComputedStyle(r).display !== 'none' ? [r.scrollHeight, r.clientHeight] : null; });
      lines.push(m ? `меню ${w}×${h}: высота ${m[0]} из ${m[1]} px, под краем ${Math.max(0, m[0] - m[1])} px` : `меню ${w}×${h}: свёрнуто (телефонная шапка)`);
      await c3.close();
    }
    // ── Два уведомления подряд: закрыть два срока (между нажатиями — дольше защиты от двойного нажатия 1,2 с) ──
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const page = await ctx.newPage();
    // Сценарий приёмки С-1: закрыть срок и сразу ответить на вопрос — два разных уведомления
    await open(page, '#/today');
    // Ждём не по часам, а по странице: занятый ПК иногда показывал первое уведомление позже — замер видел одно
    const count = () => page.locator('.toasts > .toast:not(.is-leaving)').count();
    await page.locator('.dtable__row .check-btn').first().click();
    await page.waitForFunction(() => document.querySelectorAll('.toasts > .toast:not(.is-leaving)').length >= 1, null, { timeout: 5000 }).catch(() => {});
    await page.locator('.panel--wheat button', { hasText: /^Да$/ }).first().click();
    await page.waitForFunction(() => document.querySelectorAll('.toasts > .toast:not(.is-leaving)').length >= 2, null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400); // столбик доехал (пружина), меряем места кнопок
    if ((await count()) < 2) lines.push('уведомления 1280: второе не появилось за 5 с — проверить вручную');
    const t = await page.evaluate(() => {
      const toasts = [...document.querySelectorAll('.toasts > .toast:not(.is-leaving)')];
      let buttons = 0, blocked = 0, overlaps = 0;
      for (const toast of toasts) for (const btn of toast.querySelectorAll('button')) {
        const r = btn.getBoundingClientRect();
        if (!r.width) continue;
        buttons++;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!hit || !btn.contains(hit)) blocked++;
      }
      const rs = toasts.map((x) => x.getBoundingClientRect());
      for (let a = 0; a < rs.length; a++) for (let b = a + 1; b < rs.length; b++) {
        const p = rs[a], q = rs[b];
        if (p.left < q.right - 1 && q.left < p.right - 1 && p.top < q.bottom - 1 && q.top < p.bottom - 1) overlaps++;
      }
      return { toasts: toasts.length, buttons, blocked, overlaps };
    });
    lines.push(`уведомления 1280: на экране ${t.toasts}, кнопок ${t.buttons}, закрыто другим ${t.blocked}, перекрытий ${t.overlaps}`);
    await ctx.close();
  } finally {
    await browser.close();
  }
  for (const l of lines) console.log(l);
  process.exit(0);
}

if (PRINT) {
  const browser = await chromium.launch();
  const out = [];
  try {
    // 703 px — лист A4 за вычетом полей 12 мм (как печатает Chrome по print.css); 794 px — весь лист, как мерил «Пользователь»
    for (const [theme, pw] of [['light', 703], ['dark', 703], ['light', 794], ['dark', 794]]) {
      const ctx = await browser.newContext({ viewport: { width: pw, height: 1000 } });
      const page = await ctx.newPage();
      for (const s of PRINT_SCREENS) {
        if (ONLY && !ONLY.includes(s.name)) continue;
        await page.goto('about:blank');
        await page.goto(`${BASE}${BASE.includes('?') ? '&' : '?'}demo=1&theme=${theme}`, { waitUntil: 'load' });
        await page.waitForTimeout(1800);
        await page.evaluate((h) => { location.hash = h; }, s.hash);
        await page.waitForTimeout(1200);
        try { if (s.open) { await s.open(page); await page.waitForTimeout(900); } } catch { /* окна нет — печатаем экран */ }
        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(300);
        const m = await page.evaluate(measurePrint);
        const pdf = await page.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: false });
        const sheets = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
        await page.emulateMedia({ media: 'screen' });
        out.push({ screen: s.name, view: `${pw} ${theme === 'light' ? 'свет' : 'тьма'}`, clipped: m.clipped, emptyPct: m.emptyPct, rows: m.rows, ui: m.ui, sheets, details: [...m.clippedList, ...m.uiList] });
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  const pad = (v, n) => String(v).padEnd(n);
  console.log(`${pad('печать', 12)}${pad('лист', 11)}обрезано  интерфейс  пусто справа  строк  листов`);
  for (const r of out) console.log(`${pad(r.screen, 12)}${pad(r.view, 11)}${pad(r.clipped, 10)}${pad(r.ui, 11)}${pad(r.emptyPct + ' %', 13)}${pad(r.rows, 7)}${r.sheets}`);
  console.log(`\nИтого: обрезано ${out.reduce((a, r) => a + r.clipped, 0)} · интерфейс на бумаге ${out.reduce((a, r) => a + r.ui, 0)} · пусто справа больше 25 % — ${out.filter((r) => r.emptyPct > 25).length} экр.`);
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(out, null, 1));
  if (STRICT && out.some((r) => r.clipped > 0 || r.ui > 0 || r.emptyPct > 25)) process.exit(1);
  process.exit(0);
}

const VIEWS = [
  { w: 1280, h: 860, theme: 'light' }, { w: 1280, h: 860, theme: 'dark' },
  { w: 1024, h: 800, theme: 'light' }, { w: 1024, h: 800, theme: 'dark' },
  { w: 375, h: 812, theme: 'light' }, { w: 375, h: 812, theme: 'dark' },
];

// root — что проверяем; open — как открыть окно / список (после загрузки экрана)
const SCREENS = [
  { name: 'сегодня', hash: '#/today', root: '.page' },
  { name: 'входящие', hash: '#/inbox', root: '.page' },
  { name: 'переписка', hash: '#/inbox', root: '.page', open: (p) => p.locator('.chats__list .chat').first().click() },
  { name: 'клиенты', hash: '#/clients', root: '.page' },
  { name: 'карточка', hash: '#/clients', root: 'dialog[open] .modal__box', open: (p) => p.locator('.ctable__row .ctable__open').first().click() },
  { name: 'КВЕД +N', hash: '#/clients', root: '.kv-pop', open: async (p) => {
    // Самый длинный список — у него точно есть прокрутка
    const i = await p.$$eval('.kv__more', (els) => els.reduce((best, e, k, a) => (parseInt(e.textContent.slice(1), 10) > parseInt(a[best].textContent.slice(1), 10) ? k : best), 0));
    const m = p.locator('.kv__more').nth(i); await m.scrollIntoViewIfNeeded(); await m.click();
  } },
  { name: 'сроки', hash: '#/deadlines', root: '.page' },
  { name: 'платежи', hash: '#/payments', root: '.page' },
  { name: 'задачи', hash: '#/tasks', root: '.page' },
  { name: 'ключи', hash: '#/keys', root: '.page' },
  { name: 'справочник', hash: '#/reference', root: '.page' },
  { name: 'помощь', hash: '#/help', root: '.page' },
  { name: 'месяц', hash: '#/month', root: '.page' },
  { name: 'ещё', hash: '#/more', root: '.page' },
  { name: 'окно платежа', hash: '#/today', root: 'dialog[open] .modal__box', open: (p) => p.keyboard.press('Alt+n') },
  { name: 'новый клиент', hash: '#/clients', root: 'dialog[open] .modal__box', open: (p) => p.locator('button', { hasText: 'Добавить клиента' }).first().click() },
  { name: 'поиск Ctrl K', hash: '#/today', root: '.palette__box', open: (p) => p.keyboard.press('Control+k') },
];

/** Внутри страницы: пустоты, разная высота соседей, подписи. Прокрутку колесом проверяем снаружи (настоящее колесо). */
function measure(rootSel) {
  const root = document.querySelector(rootSel);
  if (!root) return { missing: true };
  const R = root.getBoundingClientRect();
  const sx = window.scrollX, sy = window.scrollY;
  const visible = (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05 && r.width > 0 && r.height > 0; };
  const hasPaint = (el) => { const cs = getComputedStyle(el); const bg = cs.backgroundColor; return (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') || cs.backgroundImage !== 'none' || (cs.boxShadow !== 'none' && cs.boxShadow !== '') || parseFloat(cs.borderTopWidth) > 0; };
  const label = (el) => (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : el.tagName.toLowerCase()) + ' «' + (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30) + '»';

  // ── 1. Пустоты: «атомы» содержимого (текст, значки, поля, кнопки, закрашенные листья) на сетке 20 px ──
  const CELL = 20;
  const W = Math.ceil(R.width / CELL), H = Math.ceil(R.height / CELL);
  const grid = new Uint8Array(W * H);
  const mark = (r, pad = 8) => {
    const x0 = Math.max(0, Math.floor((r.left - R.left - pad) / CELL)), x1 = Math.min(W - 1, Math.floor((r.right - R.left + pad) / CELL));
    const y0 = Math.max(0, Math.floor((r.top - R.top - pad) / CELL)), y1 = Math.min(H - 1, Math.floor((r.bottom - R.top + pad) / CELL));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) grid[y * W + x] = 1;
  };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim() || !n.parentElement || !visible(n.parentElement)) continue;
    const rg = document.createRange(); rg.selectNodeContents(n);
    for (const r of rg.getClientRects()) mark(r);
  }
  // Строка списка выбора ([role=option]) — целиком место нажатия, а не пустота между названием и подсказкой
  for (const el of root.querySelectorAll('img, svg, canvas, input, select, textarea, button, a, .avatar, .icon-tile, [role=img], [role=option]')) if (visible(el)) mark(el.getBoundingClientRect());
  for (const el of root.querySelectorAll('*')) if (!el.children.length && visible(el) && hasPaint(el)) mark(el.getBoundingClientRect());
  // Строка списка или таблицы, у которой содержимое у обоих краёв (текст слева, срок справа), — целиком содержимое:
  // промежуток между колонками строки — не пустота
  for (const row of root.querySelectorAll('li, tr, [role=row], [role=option], .more__item')) {
    if (!visible(row)) continue;
    const rr = row.getBoundingClientRect();
    if (rr.width < 200) continue;
    let minL = Infinity, maxR = -Infinity;
    const take = (r) => { if (r.width > 0) { minL = Math.min(minL, r.left); maxR = Math.max(maxR, r.right); } };
    const tw = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (!n.textContent.trim() || !n.parentElement || !visible(n.parentElement)) continue;
      const rg = document.createRange(); rg.selectNodeContents(n); for (const r of rg.getClientRects()) take(r);
    }
    for (const el of row.querySelectorAll('svg, img, input, button, select')) if (visible(el)) take(el.getBoundingClientRect());
    if (minL <= rr.left + rr.width * 0.3 && maxR >= rr.right - rr.width * 0.2) mark(rr, 0);
  }
  // Ниже последнего блока — конец страницы, а не пустота
  let lastRow = 0;
  for (let i = 0; i < W * H; i++) if (grid[i]) lastRow = Math.floor(i / W);
  for (let i = (lastRow + 1) * W; i < W * H; i++) grid[i] = 1;
  let voids = 0;
  const voidList = [];
  const seen = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (grid[i] || seen[i]) continue;
    let minx = W, miny = H, maxx = 0, maxy = 0, count = 0;
    const stack = [i]; seen[i] = 1;
    while (stack.length) {
      const k = stack.pop(); const x = k % W, y = (k - x) / W; count++;
      minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx; if (!grid[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
      }
    }
    const bw = (maxx - minx + 1) * CELL, bh = (maxy - miny + 1) * CELL;
    // Пустота — сплошная (заполнена хотя бы на 60 %), не уже 200 и не ниже 200 px
    if (bw >= 200 && bh >= 200 && count >= 0.6 * (maxx - minx + 1) * (maxy - miny + 1)) {
      voids++;
      voidList.push(`${bw}×${bh} px от (${Math.round(R.left + minx * CELL + sx)}, ${Math.round(R.top + miny * CELL + sy)})`);
    }
  }

  // Рваный перенос: ряд фильтров / кнопок переломился, и строка оставила справа пустую полосу шире 35 % ряда
  // (владелец 16.10: «фильтры в две строки, справа большая пустая полоса»).
  for (const box of root.querySelectorAll('*')) {
    const cs = getComputedStyle(box);
    if (!/flex/.test(cs.display) || cs.flexWrap !== 'wrap' || cs.flexDirection === 'column' || !visible(box)) continue;
    const kids = [...box.children].filter((c) => visible(c) && getComputedStyle(c).position !== 'absolute');
    if (kids.length < 3 || !kids.every((k) => k.matches('button, a, label, input, .chip, .chips, .seg, .tabs, .btn, [role=group]'))) continue;
    const B = box.getBoundingClientRect();
    // Строки переноса — по перекрытию по вертикали (кнопка 40 px и сегмент 46 px в одной строке — одна строка)
    const lines = [];
    for (const r of kids.map((k) => k.getBoundingClientRect()).sort((a, b) => a.top - b.top)) {
      const line = lines.find((l) => r.top < l.bottom - 4 && r.bottom > l.top + 4);
      if (line) { line.right = Math.max(line.right, r.right); line.bottom = Math.max(line.bottom, r.bottom); } else lines.push({ top: r.top, bottom: r.bottom, right: r.right });
    }
    if (lines.length < 2) continue;
    for (const { right } of lines) {
      const empty = B.right - parseFloat(cs.paddingRight) - right;
      if (empty > 0.35 * B.width && empty >= 200) { voids++; voidList.push(`рваный перенос ${label(box)}: справа пусто ${Math.round(empty)} px`); break; }
    }
  }

  // ── 2. Соседи в ряду разной высоты: карточки, кнопки, фишки в одном ряду flex/grid ──
  let uneven = 0;
  const unevenList = [];
  const cardish = (el) => hasPaint(el) || el.matches('.btn, .chip, .seg__opt, .plan__step, .tally, .panel');
  for (const box of [root, ...root.querySelectorAll('*')]) {
    const cs = getComputedStyle(box);
    if (!/flex|grid/.test(cs.display) || cs.flexDirection === 'column' || !visible(box)) continue;
    // Столбики графика разной высоты по смыслу (поступления по дням, нагрузка по неделям)
    if (box.closest('[role=img], [aria-hidden=true], .wload__weeks')) continue;
    const kids = [...box.children].filter((c) => visible(c) && cardish(c) && getComputedStyle(c).position !== 'absolute');
    if (kids.length < 2) continue;
    // Ряд — соседи, что перекрываются по вертикали; липкая колонка (календарь «Сроков») едет за прокруткой — не в счёт
    const rows = [];
    for (const k of kids.filter((c) => getComputedStyle(c).position !== 'sticky')) {
      const r = k.getBoundingClientRect();
      const row = rows.find((q) => r.top < q.bottom - 4 && r.bottom > q.top + 4 && Math.abs(r.top - q.top) < 24);
      if (row) { row.kids.push(k); row.bottom = Math.max(row.bottom, r.bottom); } else rows.push({ top: r.top, bottom: r.bottom, kids: [k] });
    }
    for (const { kids: row } of rows) {
      if (row.length < 2) continue;
      const hs = row.map((k) => k.getBoundingClientRect().height);
      if (Math.max(...hs) - Math.min(...hs) > 4) { uneven++; unevenList.push(`${label(box)}: ${hs.map(Math.round).join('/')} px`); }
    }
  }

  // ── 4. Подписи: перенос или обрезка без многоточия у коротких подписей ──
  let labels = 0;
  const labelList = [];
  const LABELS = '.btn, .chip, .seg__opt, [role=tab], .tag, .pill, .nav a, label, [role=columnheader], .plan__step strong, .dgroup__title > span:first-child, .toast__action, .kv__more, .chat__name, .cp__h, .panel__title';
  for (const el of root.querySelectorAll(LABELS)) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3;
    const rg = document.createRange(); rg.selectNodeContents(el);
    // Строки — по перекрытию по вертикали: значок и текст одной строки (разная высота, разный низ) — одна строка
    let lines = 0, lastBottom = -Infinity;
    for (const r of [...rg.getClientRects()].filter((q) => q.width > 1 && q.height > 1).sort((a, b) => a.top - b.top)) {
      if (r.top >= lastBottom - lh * 0.3) { lines++; lastBottom = r.bottom; } else lastBottom = Math.max(lastBottom, r.bottom);
    }
    const text = (el.textContent || '').trim();
    const wrapped = text.length > 0 && text.length < 40 && lines > 1 && !el.matches('label');
    const clipped = el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== 'ellipsis' && cs.overflow !== 'visible';
    if (wrapped || clipped) { labels++; labelList.push(`${label(el)} — ${wrapped ? 'перенос' : 'обрезано'}`); }
  }

  // Повторная приёмка 16.10 (что скрипт пропустил): имя в ячейке уже 80 px («Рома…» в «Платежах» 1024),
  // короткое поле по слову в строке («Октябрь / 2026»), смысл срезан многоточием или line-clamp
  // («Податковий розрахунок, III к…», «Закрыть просроченн…»). Превью сообщений и списки чатов режутся по замыслу.
  const NAMES = '[data-client-name], .dtable__name, .paylist__who strong, .ctable__who strong, .mini__text strong, .attention__who strong, .mcheck__who .linklike';
  for (const el of root.querySelectorAll(NAMES)) {
    if (!visible(el)) continue;
    const w = el.getBoundingClientRect().width;
    if (w < 80 && (el.textContent || '').trim().length > 3) { labels++; labelList.push(`${label(el)} — имя уже 80 px (${Math.round(w)})`); }
  }
  const BY_DESIGN = '.chat__snippet, .chat__name, .chat__bottom, .palette__label, .palette__item, input, textarea, select, option, .visually-hidden, .kv-pop, .bubble';
  for (const el of root.querySelectorAll('span, strong, b, em, p, a, button, li, h1, h2, h3, h4, [role=cell]')) {
    if (!visible(el) || el.closest(BY_DESIGN)) continue;
    const text = (el.textContent || '').trim().replace(/\s+/g, ' ');
    if (!text) continue;
    const cs = getComputedStyle(el);
    // многоточие или line-clamp, которые на самом деле что-то спрятали
    const ell = cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1;
    const clamp = cs.webkitLineClamp && cs.webkitLineClamp !== 'none' && el.scrollHeight > el.clientHeight + 2;
    if (ell || clamp) { labels++; labelList.push(`${label(el)} — ${ell ? 'многоточие' : 'срезано по строкам'}`); continue; }
    // по слову в строке: короткий текст, строк столько же, сколько слов, — у трёх слов и больше
    // или в поле уже 90 px («Октябрь / 2026» в 57 px); имя «Соловей / Тетяна» в две строки шириной 120 px — нормальный перенос
    const words = text.split(' ');
    const width = el.getBoundingClientRect().width;
    if (el.children.length === 0 && words.length >= 2 && words.length <= 5 && text.length <= 30 && (words.length >= 3 || width < 90)) {
      const rg = document.createRange(); rg.selectNodeContents(el);
      const tops = new Set([...rg.getClientRects()].filter((q) => q.width > 1).map((q) => Math.round(q.top / 3)));
      if (tops.size >= words.length) { labels++; labelList.push(`${label(el)} — по слову в строке (${Math.round(width)} px)`); }
    }
  }

  // Вбок: страница или блок листаются по горизонтали («Месяц» 932 px на 1024 — 260 px вбок)
  let sideways = 0;
  const sidewaysList = [];
  if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) { sideways++; sidewaysList.push(`страница шире окна на ${document.documentElement.scrollWidth - document.documentElement.clientWidth} px`); }
  for (const el of [root, ...root.querySelectorAll('*')]) {
    const cs = getComputedStyle(el);
    if (!visible(el) || !/(auto|scroll)/.test(cs.overflowX) || el.closest('.tabs, .chips')) continue;
    const extra = el.scrollWidth - el.clientWidth;
    if (extra > 1) { sideways++; sidewaysList.push(`${label(el)} — вбок на ${extra} px`); }
  }

  // Касание (только телефон, окно уже 600 px; приёмка-5): место нажатия меньше 44 × 44 px и соседние места нажатия
  // ближе 8 px друг к другу — промах пальцем. Ссылки внутри строки текста не считаются (у них место — строка).
  let touch = 0;
  const touchList = [];
  if (window.innerWidth < 600) {
    const TARGETS = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], summary';
    const els = [...root.querySelectorAll(TARGETS)].filter((el) => {
      if (!visible(el) || el.closest('[aria-hidden=true], .visually-hidden') || el.disabled) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'inline' && el.matches('a')) return false; // ссылка в тексте
      if (el.matches('input[type=checkbox], input[type=radio]') && el.closest('label')) return false; // место — подпись
      return cs.pointerEvents !== 'none';
    });
    // Растянутая зона нажатия (::after на всю строку, как имя в строке «Клиентов») — место нажатия = вся строка
    const hitRect = (el) => {
      // Поле внутри подписи (поиск «Клиентов»): нажимается вся подпись-рамка
      const lab = el.matches('input, select, textarea') ? el.closest('label') : null;
      if (lab) return lab.getBoundingClientRect();
      const a = getComputedStyle(el, '::after');
      if (a.content !== 'none' && a.position === 'absolute') { const host = el.offsetParent; if (host) return host.getBoundingClientRect(); }
      return el.getBoundingClientRect();
    };
    const rects = els.map(hitRect);
    els.forEach((el, i) => {
      const r = rects[i];
      if (r.width < 43.5 || r.height < 43.5) { touch++; touchList.push(`${label(el)} — ${Math.round(r.width)}×${Math.round(r.height)} px`); }
    });
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
      const a = rects[i], b = rects[j];
      if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
      // Зазор нужен мелкой цели (как в WCAG 2.5.8): две цели от 44 × 44 вплотную — сегменты одной вкладки, строки
      // списка — промаха нет
      const ok = (q) => q.width >= 43.5 && q.height >= 43.5;
      if (ok(a) && ok(b)) continue;
      const dx = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
      const dy = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom));
      const overlapX = a.left < b.right && b.left < a.right, overlapY = a.top < b.bottom && b.top < a.bottom;
      const gap = overlapX ? dy : overlapY ? dx : Math.hypot(dx, dy);
      if (gap < 8 && (overlapX || overlapY)) { touch++; touchList.push(`${label(els[i])} и ${label(els[j])} — зазор ${Math.round(gap)} px`); }
    }
  }

  // Блоки с прокруткой — пометить для проверки колесом снаружи
  const scrollers = [];
  for (const el of [root, ...root.querySelectorAll('*')]) {
    const cs = getComputedStyle(el);
    if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4 && visible(el)) { el.dataset.auditScroll = String(scrollers.length); scrollers.push(label(el)); }
  }
  return { voids, voidList, uneven, unevenList: unevenList.slice(0, 12), labels, labelList: labelList.slice(0, 16), sideways, sidewaysList, touch, touchList: touchList.slice(0, 300), scrollers };
}

const browser = await chromium.launch();
const results = [];
try {
  for (const v of VIEWS) {
    // 375 — телефон с касанием, как у «Пользователя» (hasTouch): включаются правила для пальца, а не наведения
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, ...(v.w < 600 ? { hasTouch: true, isMobile: true } : {}) });
    const page = await ctx.newPage();
    for (const s of SCREENS) {
      if (ONLY && !ONLY.includes(s.name)) continue;
      // Учебный режим может перезагрузить страницу на «Сегодня» — раздел открываем после загрузки, сменой адреса
      const url = `${BASE}${BASE.includes('?') ? '&' : '?'}demo=1&theme=${v.theme}`;
      await page.goto('about:blank');
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForTimeout(1800);
      await page.evaluate((h) => { location.hash = h; }, s.hash);
      await page.waitForTimeout(1200);
      const at = await page.evaluate(() => location.hash);
      if (!at.startsWith(s.hash)) { results.push({ screen: s.name, view: `${v.w} ${v.theme === 'light' ? 'свет' : 'тьма'}`, missing: true, voids: 0, uneven: 0, wheel: 0, labels: 0, details: { hash: at } }); continue; }
      await page.addStyleTag({ content: '.toasts{display:none!important} *{animation-duration:1ms!important;transition-duration:1ms!important}' });
      try { if (s.open) { await s.open(page); await page.waitForTimeout(900); } } catch { /* окно не открылось — будет «нет корня» */ }
      const m = await page.evaluate(measure, s.root);
      let wheel = 0; const wheelList = [];
      for (let i = 0; i < (m.scrollers?.length ?? 0); i++) {
        const el = page.locator(`[data-audit-scroll="${i}"]`);
        try {
          await el.evaluate((e) => { e.scrollTop = 0; e.scrollIntoView({ block: 'nearest' }); });
          const b = await el.boundingBox();
          if (!b) continue;
          await page.mouse.move(b.x + b.width / 2, b.y + Math.min(b.height / 2, 40));
          await page.mouse.wheel(0, 240);
          await page.waitForTimeout(250);
          // Блок закрылся от прокрутки (так было у списка КВЕД) — тоже «не крутится»
          const top = (await el.count()) ? await el.evaluate((e) => e.scrollTop) : -1;
          if (top < 1) { wheel++; wheelList.push(`${m.scrollers[i]}${top < 0 ? ' — закрылся от прокрутки' : ''}`); }
        } catch { /* блок пропал до прокрутки — пропускаем */ }
      }
      results.push({ screen: s.name, view: `${v.w} ${v.theme === 'light' ? 'свет' : 'тьма'}`, missing: Boolean(m.missing), voids: m.voids ?? 0, uneven: m.uneven ?? 0, wheel, labels: m.labels ?? 0, sideways: m.sideways ?? 0, touch: m.touch ?? 0, details: { voids: m.voidList, uneven: m.unevenList, wheel: wheelList, labels: m.labelList, sideways: m.sidewaysList, touch: m.touchList } });
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('экран', 16)}${pad('вид', 12)}пустоты  высоты  колесо  подписи  вбок  касание`);
for (const r of results) console.log(`${pad(r.screen, 16)}${pad(r.view, 12)}${r.missing ? 'нет корня — окно не открылось' : `${pad(r.voids, 9)}${pad(r.uneven, 8)}${pad(r.wheel, 8)}${pad(r.labels, 9)}${pad(r.sideways, 6)}${r.touch}`}`);
const sum = (k) => results.reduce((a, r) => a + (r[k] || 0), 0);
console.log(`\nИтого: пустоты ${sum('voids')} · высоты ${sum('uneven')} · колесо ${sum('wheel')} · подписи ${sum('labels')} · вбок ${sum('sideways')} · касание (375) ${sum('touch')} · не открылось ${results.filter((r) => r.missing).length}`);
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(results, null, 1));
if (STRICT && sum('voids') + sum('uneven') + sum('wheel') + sum('labels') + sum('sideways') + results.filter((r) => r.missing).length > 0) process.exit(1);
