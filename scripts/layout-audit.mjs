// Автопроверка вёрстки (владелец, 16.10: «в следующий раз число должно ловить само, а не владелец»).
// Каждый экран, окно и всплывающий список × 1280 / 1024 / 375 × светлая / тёмная — четыре числа:
//   пустоты    — пустые области больше 200×200 px внутри контента;
//   высоты     — ряды, где соседние карточки / кнопки разной высоты (> 4 px);
//   колесо     — блоки с прокруткой, которые не крутятся колесом мыши;
//   подписи    — кнопки, фишки, метки, заголовки колонок, у которых текст перенёсся или обрезан без многоточия.
// Печать (--print): экраны на листе A4 — обрезанные подписи, пустая ширина справа в % (по строкам таблиц), листов.
// Отдельно (--checks): лента чата крутится колесом (1280, 1024); два уведомления подряд — кнопки обоих нажимаются.
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
  return { clipped: clippedList.length, clippedList: clippedList.slice(0, 12), emptyPct: Math.max(0, Math.round((1 - median / W) * 100)), rows: rights.length };
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
    // ── Два уведомления подряд: закрыть два срока (между нажатиями — дольше защиты от двойного нажатия 1,2 с) ──
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const page = await ctx.newPage();
    // Сценарий приёмки С-1: закрыть срок и сразу ответить на вопрос — два разных уведомления
    await open(page, '#/today');
    await page.locator('.dtable__row .check-btn').first().click();
    await page.waitForTimeout(1500);
    await page.locator('.panel--wheat button', { hasText: /^Да$/ }).first().click();
    await page.waitForTimeout(900);
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
    for (const theme of ['light', 'dark']) {
      // Ширина листа A4 без полей: 210 − 2 × 12 мм = 186 мм ≈ 703 px
      const ctx = await browser.newContext({ viewport: { width: 703, height: 1000 } });
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
        out.push({ screen: s.name, view: theme === 'light' ? 'свет' : 'тьма', clipped: m.clipped, emptyPct: m.emptyPct, rows: m.rows, sheets, details: m.clippedList });
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  const pad = (v, n) => String(v).padEnd(n);
  console.log(`${pad('печать', 12)}${pad('тема', 7)}обрезано  пусто справа  строк  листов`);
  for (const r of out) console.log(`${pad(r.screen, 12)}${pad(r.view, 7)}${pad(r.clipped, 10)}${pad(r.emptyPct + ' %', 13)}${pad(r.rows, 7)}${r.sheets}`);
  console.log(`\nИтого: обрезано ${out.reduce((a, r) => a + r.clipped, 0)} · пусто справа больше 25 % — ${out.filter((r) => r.emptyPct > 25).length} экр.`);
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(out, null, 1));
  if (STRICT && out.some((r) => r.clipped > 0 || r.emptyPct > 25)) process.exit(1);
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

  // Блоки с прокруткой — пометить для проверки колесом снаружи
  const scrollers = [];
  for (const el of [root, ...root.querySelectorAll('*')]) {
    const cs = getComputedStyle(el);
    if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4 && visible(el)) { el.dataset.auditScroll = String(scrollers.length); scrollers.push(label(el)); }
  }
  return { voids, voidList, uneven, unevenList: unevenList.slice(0, 12), labels, labelList: labelList.slice(0, 12), scrollers };
}

const browser = await chromium.launch();
const results = [];
try {
  for (const v of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h } });
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
      results.push({ screen: s.name, view: `${v.w} ${v.theme === 'light' ? 'свет' : 'тьма'}`, missing: Boolean(m.missing), voids: m.voids ?? 0, uneven: m.uneven ?? 0, wheel, labels: m.labels ?? 0, details: { voids: m.voidList, uneven: m.unevenList, wheel: wheelList, labels: m.labelList } });
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('экран', 16)}${pad('вид', 12)}пустоты  высоты  колесо  подписи`);
for (const r of results) console.log(`${pad(r.screen, 16)}${pad(r.view, 12)}${r.missing ? 'нет корня — окно не открылось' : `${pad(r.voids, 9)}${pad(r.uneven, 8)}${pad(r.wheel, 8)}${r.labels}`}`);
const sum = (k) => results.reduce((a, r) => a + (r[k] || 0), 0);
console.log(`\nИтого: пустоты ${sum('voids')} · высоты ${sum('uneven')} · колесо ${sum('wheel')} · подписи ${sum('labels')} · не открылось ${results.filter((r) => r.missing).length}`);
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(results, null, 1));
if (STRICT && sum('voids') + sum('uneven') + sum('wheel') + sum('labels') + results.filter((r) => r.missing).length > 0) process.exit(1);
