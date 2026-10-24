// Мелочи вида, которые владелец находил сам (17.10): подложка вкладки не по центру и вылезает за полосу, последняя
// вкладка «История» срезана правым краем, у одинаковых деталей разные радиусы и отступы. layout-audit.mjs меряет пустоты,
// высоты, колесо и подписи; этот скрипт — геометрию деталей. Каждое число > 0 — находка.
//   подложка   — индикатор выбранного (.tabs__ind, .nav__pill) не совпал с выбранной вкладкой > 1 px, вылез за полосу
//                или стоит не по центру по высоте полосы (зазор сверху ≠ зазору снизу > 1 px);
//   срез       — кнопка, вкладка, фишка срезана краем полосы или окна (видна не целиком), а явной прокрутки нет:
//                ни видимой полосы прокрутки, ни стрелок, ни затухания края (mask-image);
//   выбранное  — выбранный пункт (aria-pressed / aria-current / aria-selected) виден не целиком;
//   разнобой   — одинаковые детали (один и тот же набор классов) на одном экране с разным радиусом, отступом слева/справа,
//                высотой (> 1 px) или размером шрифта;
//   значок     — значок в кнопке / вкладке / пункте меню не по центру строки текста > 1,5 px;
//   прыжок     — при переключении вкладок полоса вкладок сдвинулась или окно поменяло ширину > 1 px; после сужения окна
//                подложка не переехала за выбранной вкладкой;
//   наезд      — текст вылез из своей ячейки сетки > 1 px (в соседнюю колонку или в поле листа);
//   противоречие — в одной строке «через N дн.» и «просрочено M дн.» (данные; передать «Серверу API» / технике).
// Запуск: node scripts/detail-audit.mjs [адрес] [--only карточка,сроки] [--views 1280x800-light,375x812-dark] [--json путь] [--strict]
//   адрес — по умолчанию http://localhost:5183/ (?demo=1 добавляется сам). 375 — телефон с касанием.
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const BASE = args.find((a) => /^https?:/.test(a)) ?? 'http://localhost:5183/';
const ONLY = flag('--only')?.split(',');
const JSON_OUT = flag('--json');
const STRICT = args.includes('--strict');

const ALL_VIEWS = [];
for (const [w, h] of [[1280, 800], [1280, 720], [1024, 768], [375, 812]]) for (const theme of ['light', 'dark']) ALL_VIEWS.push({ w, h, theme, id: `${w}x${h}-${theme}` });
const VIEWS = flag('--views') ? ALL_VIEWS.filter((v) => flag('--views').split(',').includes(v.id)) : ALL_VIEWS;

const openCard = (p) => p.locator('.ctable__row .ctable__open').first().click();
const cardTab = (name) => async (p) => { await openCard(p); await p.waitForTimeout(700); await p.locator('dialog[open] .tabs__tab', { hasText: name }).first().click(); };
// root — что меряем; open — как открыть окно / меню; tabs — переключить все вкладки этой полосы и мерить прыжки
const SCREENS = [
  { name: 'сегодня', hash: '#/today', root: 'body' },
  { name: 'входящие', hash: '#/inbox', root: 'body' },
  { name: 'переписка', hash: '#/inbox', root: 'body', open: (p) => p.locator('.chats__list .chat').first().click() },
  { name: 'клиенты', hash: '#/clients', root: 'body', tabs: '.clients__bar > .tabs' },
  { name: 'карточка', hash: '#/clients', root: 'dialog[open] .modal__box', open: openCard, tabs: 'dialog[open] .tabs' },
  { name: 'карточка·сроки', hash: '#/clients', root: 'dialog[open] .modal__box', open: cardTab('Сроки') },
  { name: 'карточка·платежи', hash: '#/clients', root: 'dialog[open] .modal__box', open: cardTab('Платежи') },
  { name: 'карточка·консультации', hash: '#/clients', root: 'dialog[open] .modal__box', open: cardTab('Консультации') },
  { name: 'карточка·история', hash: '#/clients', root: 'dialog[open] .modal__box', open: cardTab('История') },
  { name: 'сроки', hash: '#/deadlines', root: 'body', tabs: '.page .tabs' },
  { name: 'сроки·действия', hash: '#/deadlines', root: 'body', open: (p) => p.locator('.dtable__tools button', { hasText: 'Действия' }).first().click({ force: true }) },
  { name: 'платежи', hash: '#/payments', root: 'body' },
  { name: 'задачи', hash: '#/tasks', root: 'body', tabs: '.page .tabs' },
  { name: 'ключи', hash: '#/keys', root: 'body' },
  { name: 'справочник', hash: '#/reference', root: 'body', tabs: '.page .tabs' },
  { name: 'помощь', hash: '#/help', root: 'body' },
  { name: 'месяц', hash: '#/month', root: 'body' },
  { name: 'ещё', hash: '#/more', root: 'body' },
  { name: 'окно платежа', hash: '#/today', root: 'dialog[open] .modal__box', open: (p) => p.keyboard.press('Alt+n') },
  { name: 'новый клиент', hash: '#/clients', root: 'dialog[open] .modal__box', open: (p) => p.locator('button', { hasText: 'Добавить клиента' }).first().click() },
  { name: 'поиск Ctrl K', hash: '#/today', root: '.palette__box', open: (p) => p.keyboard.press('Control+k') },
];

/** Геометрия деталей внутри root. */
function measure(rootSel) {
  const root = document.querySelector(rootSel);
  if (!root) return { missing: true };
  const vis = (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05 && r.width > 0 && r.height > 0 && !el.closest('.visually-hidden, [inert]'); };
  const label = (el) => (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : el.tagName.toLowerCase()) + ' «' + (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 28) + '»';
  const r1 = (n) => Math.round(n * 10) / 10;
  const W = document.documentElement.clientWidth, H = window.innerHeight;
  // Видимая часть элемента: пересечение с окном и со всеми предками, которые режут содержимое (overflow не visible)
  const clipOf = (el) => {
    let r = el.getBoundingClientRect();
    let box = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    const cut = (q) => { box = { l: Math.max(box.l, q.left), t: Math.max(box.t, q.top), r: Math.min(box.r, q.right), b: Math.min(box.b, q.bottom) }; };
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
        const q = a.getBoundingClientRect();
        const bl = parseFloat(cs.borderLeftWidth), bt = parseFloat(cs.borderTopWidth);
        const inner = { left: q.left + bl, top: q.top + bt, right: q.left + bl + a.clientWidth, bottom: q.top + bt + a.clientHeight };
        cut({ left: cs.overflowX === 'visible' ? -1e9 : inner.left, right: cs.overflowX === 'visible' ? 1e9 : inner.right, top: cs.overflowY === 'visible' ? -1e9 : inner.top, bottom: cs.overflowY === 'visible' ? 1e9 : inner.bottom });
      }
      if (cs.position === 'fixed') break;
    }
    cut({ left: 0, top: -1e9, right: W, bottom: 1e9 }); // по вертикали страница листается — режем только по ширине окна
    return { el: r, vis: box };
  };

  // ── 1. Подложка выбранного ──
  const ind = [];
  const INDICATORS = [
    { ind: '.tabs__ind', strip: '.tabs', active: '.tabs__tab[aria-pressed="true"]' },
    { ind: '.nav__pill', strip: '.nav', active: '.nav__item[aria-current="page"]' },
  ];
  for (const d of INDICATORS) {
    for (const strip of root.querySelectorAll(d.strip)) {
      const pill = strip.querySelector(`:scope > ${d.ind}`);
      const act = strip.querySelector(`:scope > ${d.active}`);
      if (!pill || !act || !vis(strip) || !vis(act) || Number(getComputedStyle(pill).opacity) < 0.5) continue;
      const P = pill.getBoundingClientRect(), A = act.getBoundingClientRect(), S = strip.getBoundingClientRect();
      const cs = getComputedStyle(strip);
      const pt = parseFloat(cs.paddingTop), pb = parseFloat(cs.paddingBottom);
      const off = { l: P.left - A.left, r: P.right - A.right, t: P.top - A.top, b: P.bottom - A.bottom };
      const bad = [];
      if (Math.max(...Object.values(off).map(Math.abs)) > 1) bad.push(`не совпала с «${act.textContent.trim().slice(0, 16)}»: слева ${r1(off.l)}, справа ${r1(off.r)}, сверху ${r1(off.t)}, снизу ${r1(off.b)} px`);
      // Внутри полосы: не вылезает за её край
      if (P.top < S.top - 0.5 || P.bottom > S.bottom + 0.5) bad.push(`вылезла за полосу по высоте: сверху ${r1(S.top - P.top)}, снизу ${r1(P.bottom - S.bottom)} px`);
      // По центру: зазор от края полосы сверху и снизу одинаковый (для одной строки вкладок)
      const oneRow = A.height > S.height - pt - pb - 2;
      if (oneRow && Math.abs((P.top - S.top) - (S.bottom - P.bottom)) > 1) bad.push(`не по центру полосы: сверху ${r1(P.top - S.top)}, снизу ${r1(S.bottom - P.bottom)} px`);
      // Видна целиком (полоса или окно не режут подложку)
      const c = clipOf(pill);
      const cutW = (c.el.right - c.el.left) - Math.max(0, c.vis.r - c.vis.l);
      if (cutW > 1) bad.push(`срезана краем на ${r1(cutW)} px`);
      for (const b of bad) ind.push(`${label(strip)} ${d.ind}: ${b}`);
    }
  }

  // ── 2. Полосы: последний пункт виден целиком или есть явная прокрутка ──
  const cut = [];
  const TARGET = 'button, a[href], [role=tab], .chip, .seg__opt, .tabs__tab, .nav__item';
  const STRIPS = '.tabs, .chips, .seg, [role=tablist], [role=group], nav, .tabbar, .dl-tools, .clients__bar';
  const affordance = (strip) => {
    const cs = getComputedStyle(strip);
    if (cs.maskImage && cs.maskImage !== 'none') return 'затухание';
    if (cs.webkitMaskImage && cs.webkitMaskImage !== 'none') return 'затухание';
    const bar = strip.offsetHeight - strip.clientHeight - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth);
    if (/(auto|scroll)/.test(cs.overflowX) && bar > 0 && cs.scrollbarWidth !== 'none') return 'полоса прокрутки';
    const sib = [...(strip.parentElement?.querySelectorAll('button[aria-label]') ?? [])].find((b) => /влево|вправо|прокрут|дальше|назад/i.test(b.getAttribute('aria-label')));
    return sib && vis(sib) ? 'стрелки' : '';
  };
  const seen = new Set();
  for (const strip of root.querySelectorAll(STRIPS)) {
    if (!vis(strip)) continue;
    const items = [...strip.querySelectorAll(`:scope > ${TARGET.split(', ').join(', :scope > ')}`)].filter(vis);
    if (items.length < 2) continue;
    const hidden = strip.scrollWidth - strip.clientWidth;
    const aff = affordance(strip);
    if (hidden > 1 && !aff) cut.push(`${label(strip)} — уходит вбок на ${hidden} px без видимой прокрутки (прячет «${items.at(-1).textContent.trim().slice(0, 16)}»)`);
    for (const it of items) {
      if (seen.has(it)) continue; seen.add(it);
      const c = clipOf(it);
      const lost = (c.el.right - c.el.left) - Math.max(0, c.vis.r - c.vis.l);
      if (lost > 1 && !(hidden > 1 && aff)) cut.push(`${label(it)} — срезано на ${r1(lost)} px`);
    }
  }
  // Любая кнопка, срезанная по ширине краем окна или контейнера (не в полосе)
  for (const it of root.querySelectorAll('button, a.btn, .chip, .pill, .tag')) {
    if (seen.has(it) || !vis(it)) continue;
    const c = clipOf(it);
    const lost = (c.el.right - c.el.left) - Math.max(0, c.vis.r - c.vis.l);
    const lostH = (c.el.bottom - c.el.top) - Math.max(0, c.vis.b - c.vis.t);
    // целиком спрятанное прокруткой — не срез; срез — видно частично
    if ((lost > 1 && lost < c.el.width - 1) || (lostH > 1 && lostH < c.el.height - 1 && c.vis.r > c.vis.l)) {
      const host = it.closest('[class]')?.parentElement;
      const sc = host && [...function* (a) { for (; a; a = a.parentElement) yield a; }(it.parentElement)].find((a) => /(auto|scroll)/.test(getComputedStyle(a).overflowY) && a.scrollHeight > a.clientHeight + 2);
      if (lostH > 1 && sc) continue; // в прокручиваемом списке срез по высоте — край прокрутки
      cut.push(`${label(it)} — видна не целиком: срезано ${r1(lost)} px по ширине, ${r1(lostH)} px по высоте`);
    }
  }

  // ── 3. Выбранный пункт виден целиком ──
  const sel = [];
  for (const el of root.querySelectorAll('[aria-pressed="true"], [aria-current="page"], [aria-selected="true"]')) {
    if (!vis(el)) continue;
    const c = clipOf(el);
    const lost = (c.el.right - c.el.left) - Math.max(0, c.vis.r - c.vis.l);
    if (lost > 1 && lost < c.el.width - 1) sel.push(`${label(el)} — выбранное срезано на ${r1(lost)} px`);
  }

  // ── 4. Разнобой одинаковых деталей ──
  const mix = [];
  const KIND = /^(btn|chip|pill|tag|seg__opt|tabs__tab|icon-btn|tally|panel|kbd|field|input|search-field|nav__item|check-btn|avatar)(--[\w-]+)?$/;
  const groups = new Map();
  for (const el of root.querySelectorAll('.btn, .chip, .pill, .tag, .seg__opt, .tabs__tab, .icon-btn, .tally, .panel, .kbd, .search-field, .nav__item, .check-btn, .avatar')) {
    if (!vis(el)) continue;
    const all = (typeof el.className === 'string' ? el.className.split(/\s+/) : []).filter((c) => c && !/^(is-|has-)/.test(c));
    if (!all.some((c) => KIND.test(c))) continue;
    // Одинаковые — тот же тег и тот же набор классов («Действия» с классом icon-btn — не то же, что значок-кнопка)
    // в том же месте (два ближайших родителя с классом: меню звука в боковом меню и на экране «Ещё» — разные места)
    const place = [...function* (a) { for (; a; a = a.parentElement) yield a; }(el.parentElement)].filter((a) => typeof a.className === 'string' && a.className.trim()).slice(0, 2).map((a) => a.className.trim().split(/\s+/)[0]).reverse().join(' .');
    const key = el.tagName.toLowerCase() + '.' + all.sort().join('.') + ' в .' + place;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    const v = { radius: cs.borderTopLeftRadius, pl: cs.paddingLeft, pr: cs.paddingRight, fs: cs.fontSize, h: Math.round(r.height) };
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ el, v });
  }
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    for (const prop of ['radius', 'pl', 'pr', 'fs']) {
      const vals = [...new Set(list.map((x) => x.v[prop]))];
      if (vals.length > 1) mix.push(`${key}: ${({ radius: 'радиус', pl: 'отступ слева', pr: 'отступ справа', fs: 'шрифт' })[prop]} ${vals.join(' / ')}`);
    }
    // Высота — только у соседей в одном ряду (листы друг под другом по смыслу разной высоты)
    const rows = [];
    for (const x of list) {
      const r = x.el.getBoundingClientRect();
      const row = rows.find((q) => r.top < q.bottom - 2 && r.bottom > q.top + 2);
      if (row) { row.hs.push(Math.round(r.height)); row.bottom = Math.max(row.bottom, r.bottom); } else rows.push({ top: r.top, bottom: r.bottom, hs: [Math.round(r.height)] });
    }
    for (const { hs } of rows) if (hs.length > 1 && Math.max(...hs) - Math.min(...hs) > 1) mix.push(`${key}: высота в одном ряду ${[...new Set(hs)].join(' / ')}`);
  }

  // ── 5. Значок по центру строки текста ──
  const icon = [];
  for (const el of root.querySelectorAll('.btn, .chip, .tabs__tab, .seg__opt, .nav__item, .tag, .pill, [role=menuitem], .menu__item')) {
    if (!vis(el)) continue;
    const svg = el.querySelector(':scope > svg, :scope > .icon, :scope > [data-icon]');
    if (!svg || !vis(svg)) continue;
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let txt = null;
    for (let n = tw.nextNode(); n; n = tw.nextNode()) if (n.textContent.trim() && !n.parentElement.closest('.kbd, .tabs__count, .chip__n, .nav__badge')) { txt = n; break; }
    if (!txt) continue;
    const rg = document.createRange(); rg.selectNodeContents(txt);
    const lines = [...rg.getClientRects()].filter((q) => q.width > 1);
    if (lines.length !== 1) continue;
    const S = svg.getBoundingClientRect(), T = lines[0];
    const d = (S.top + S.bottom) / 2 - (T.top + T.bottom) / 2;
    if (Math.abs(d) > 1.5) icon.push(`${label(el)} — значок ${d > 0 ? 'ниже' : 'выше'} текста на ${r1(Math.abs(d))} px`);
  }

  const spill = [];
  // ── 5б. Текст вылез из своей ячейки сетки («просрочено 24 дн.» шире колонки 11rem — в поле листа на 7 px) ──
  for (const cell of root.querySelectorAll('*')) {
    const p = cell.parentElement;
    if (!p || getComputedStyle(p).display !== 'grid' || !vis(cell) || cell.closest('.visually-hidden, [aria-hidden=true]')) continue;
    const C = cell.getBoundingClientRect();
    if (C.width < 24) continue;
    const tw = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    let over = 0;
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (!n.textContent.trim() || !n.parentElement || !vis(n.parentElement)) continue;
      // Текст, спрятанный многоточием или прокруткой внутри ячейки, — не наезд (его ловит layout-audit)
      if (n.parentElement !== cell && [...function* (a) { for (; a && a !== cell; a = a.parentElement) yield a; }(n.parentElement)].some((a) => getComputedStyle(a).overflowX !== 'visible')) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const q of rg.getClientRects()) if (q.width > 0) over = Math.max(over, q.right - C.right, C.left - q.left);
    }
    if (over > 1) spill.push(`${label(cell)} — текст вылез из ячейки на ${r1(over)} px`);
  }

  // ── 6. Противоречие чисел в одной строке ──
  const contra = [];
  for (const row of root.querySelectorAll('li, tr, [role=row], .dtable__row, .tasks__row, .task, .attention__item, .mini__row, .feed__item, .kgrid__row')) {
    if (!vis(row)) continue;
    const t = (row.textContent || '').replace(/\s+/g, ' ');
    const soon = t.match(/через\s+(\d+)\s*дн/i), late = t.match(/просрочен\w*\s+(\d+)\s*дн/i);
    if (soon && late && !row.querySelector('li, tr, .dtable__row')) contra.push(`${label(row)} — «через ${soon[1]} дн.» и «просрочено ${late[1]} дн.» в одной строке`);
  }
  return { ind, cut, sel, mix, icon, spill, contra };
}

/** Пружины и переходы доехали — иначе на занятом ПК подложка меряется на полпути (ложный «прыжок»). */
const settled = (page) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity), null, { timeout: 4000 }).catch(() => {});

/** Полоса вкладок: переключить каждую, после пружины сравнить полосу, окно и подложку. */
async function tabJumps(page, stripSel) {
  const out = [];
  const strip = page.locator(stripSel).first();
  if (!(await strip.count())) return out;
  const n = await strip.locator('.tabs__tab').count();
  const box = () => page.evaluate((s) => {
    const st = document.querySelector(s); const m = st?.closest('.modal__box');
    const a = st?.getBoundingClientRect(); const b = m?.getBoundingClientRect();
    // В координатах страницы: нажатие само докручивает страницу до вкладки — это не сдвиг вёрстки
    return { x: (a?.left ?? 0) + scrollX, y: (a?.top ?? 0) + scrollY, w: b?.width ?? 0 };
  }, stripSel);
  const first = await box();
  for (let i = 0; i < n; i++) {
    await strip.locator('.tabs__tab').nth(i).click();
    await page.waitForTimeout(750);
    await settled(page);
    const b = await box();
    const name = (await strip.locator('.tabs__tab').nth(i).textContent())?.trim().slice(0, 16);
    if (Math.abs(b.x - first.x) > 1 || Math.abs(b.y - first.y) > 1) out.push(`«${name}»: полоса сдвинулась на ${Math.round(b.x - first.x)} / ${Math.round(b.y - first.y)} px`);
    if (first.w && Math.abs(b.w - first.w) > 1) out.push(`«${name}»: окно сменило ширину ${Math.round(first.w)} → ${Math.round(b.w)} px`);
    const ind = await page.evaluate((s) => {
      const st = document.querySelector(s); const p = st?.querySelector(':scope > .tabs__ind'); const a = st?.querySelector(':scope > .tabs__tab[aria-pressed="true"]');
      if (!p || !a) return null; const P = p.getBoundingClientRect(), A = a.getBoundingClientRect(), S = st.getBoundingClientRect();
      return { d: Math.max(Math.abs(P.left - A.left), Math.abs(P.right - A.right), Math.abs(P.top - A.top), Math.abs(P.bottom - A.bottom)), out: Math.max(0, S.top - P.top, P.bottom - S.bottom, S.left - P.left, P.right - S.right) };
    }, stripSel);
    if (ind && (ind.d > 1 || ind.out > 0.5)) out.push(`«${name}»: подложка мимо вкладки на ${Math.round(ind.d * 10) / 10} px, за полосой ${Math.round(ind.out * 10) / 10} px`);
  }
  // Окно сузили (прилипание к краю экрана, поворот телефона) — подложка переезжает за последней вкладкой, а не остаётся на старом месте
  const vp = page.viewportSize();
  await page.setViewportSize({ width: vp.width >= 600 ? 520 : 330, height: vp.height });
  await page.waitForTimeout(800);
  await settled(page);
  const after = await page.evaluate((s) => {
    const st = document.querySelector(s); const p = st?.querySelector(':scope > .tabs__ind'); const a = st?.querySelector(':scope > .tabs__tab[aria-pressed="true"]');
    if (!p || !a) return null; const P = p.getBoundingClientRect(), A = a.getBoundingClientRect();
    return Math.max(Math.abs(P.left - A.left), Math.abs(P.right - A.right), Math.abs(P.top - A.top), Math.abs(P.bottom - A.bottom));
  }, stripSel);
  if (after !== null && after > 1) out.push(`окно сузили до ${vp.width >= 600 ? 520 : 330} px: подложка мимо вкладки на ${Math.round(after)} px`);
  await page.setViewportSize(vp);
  await page.waitForTimeout(500);
  return out;
}

const KEYS = ['ind', 'cut', 'sel', 'mix', 'icon', 'spill', 'jump', 'contra'];
const browser = await chromium.launch();
const results = [];
try {
  for (const v of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, ...(v.w < 600 ? { hasTouch: true, isMobile: true } : {}) });
    const page = await ctx.newPage();
    for (const s of SCREENS) {
      if (ONLY && !ONLY.includes(s.name)) continue;
      await page.goto('about:blank');
      await page.goto(`${BASE}${BASE.includes('?') ? '&' : '?'}demo=1&theme=${v.theme}`, { waitUntil: 'load' });
      await page.waitForTimeout(1500);
      await page.evaluate((h) => { location.hash = h; }, s.hash);
      await page.waitForTimeout(1100);
      await page.addStyleTag({ content: '.toasts{display:none!important}' });
      try { if (s.open) { await s.open(page); await page.waitForTimeout(900); } } catch { /* не открылось — «нет корня» */ }
      // Пружины доехали (подложка переезжает 550 мс)
      await page.evaluate(() => document.fonts.ready.then(() => true));
      await page.waitForTimeout(300);
      await settled(page);
      const m = await page.evaluate(measure, s.root);
      const jump = !m.missing && s.tabs ? await tabJumps(page, s.tabs) : [];
      const row = { screen: s.name, view: `${v.w}×${v.h} ${v.theme === 'light' ? 'свет' : 'тьма'}`, missing: Boolean(m.missing), details: { ...m, jump } };
      for (const k of KEYS) row[k] = (row.details[k] ?? []).length;
      results.push(row);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

const pad = (x, n) => String(x).padEnd(n);
console.log(`${pad('экран', 23)}${pad('вид', 16)}подложка  срез  выбранное  разнобой  значок  наезд  прыжок  противоречие`);
for (const r of results) console.log(`${pad(r.screen, 23)}${pad(r.view, 16)}${r.missing ? 'нет корня — окно не открылось' : `${pad(r.ind, 10)}${pad(r.cut, 6)}${pad(r.sel, 11)}${pad(r.mix, 10)}${pad(r.icon, 8)}${pad(r.spill, 7)}${pad(r.jump, 8)}${r.contra}`}`);
const sum = (k) => results.reduce((a, r) => a + (r[k] || 0), 0);
console.log(`\nИтого: подложка ${sum('ind')} · срез ${sum('cut')} · выбранное ${sum('sel')} · разнобой ${sum('mix')} · значок ${sum('icon')} · наезд ${sum('spill')} · прыжок ${sum('jump')} · противоречие ${sum('contra')} · не открылось ${results.filter((r) => r.missing).length}`);
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(results, null, 1));
if (STRICT && KEYS.reduce((a, k) => a + sum(k), 0) + results.filter((r) => r.missing).length > 0) process.exit(1);
