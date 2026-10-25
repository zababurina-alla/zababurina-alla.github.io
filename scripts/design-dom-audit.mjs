// Замер эталона DESIGN.md на отрисованном экране — то, что владелец видит за 2 секунды, числом:
//   радиусы   — разные скругления у видимых плашек (фон, рамка или тень); «круг» — радиус ≥ половины высоты;
//   шрифты    — разные размеры, начертания и семейства у элементов с текстом;
//   промежутки — разные вертикальные промежутки между соседними блоками экрана (дети .page и их сетки);
//   края      — разные левые края блоков и заголовков (текст заголовка должен стоять по краю листа);
//   вне шкалы — значения, которых нет в DESIGN.md (шкалы — scripts/design-lib.ts).
// Плюс снимок экрана целиком в папку --out (для глаз проверяющего).
// Запуск (на собранной dist, как приёмка): npm run build; npm run preview -- --port 4180 --strictPort
//   node scripts/design-dom-audit.mjs http://localhost:4180/ [--only сегодня,платежи] [--out папка] [--json файл] [--look a]
// --look a — вид A «Тихий премиум» (флажок ?look=a) и его шкала (DESIGN.md §1–3); без него — старый вид (§9).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const BASE = args.find((a) => /^https?:/.test(a)) ?? 'http://localhost:4180/';
const ONLY = flag('--only')?.split(',');
const OUT = flag('--out');
const JSON_OUT = flag('--json');
const LOOK_A = flag('--look') === 'a';

const SCREENS = [
  { name: 'сегодня', hash: '#/today' },
  { name: 'входящие', hash: '#/inbox' },
  { name: 'клиенты', hash: '#/clients' },
  { name: 'сроки', hash: '#/deadlines' },
  { name: 'платежи', hash: '#/payments' },
  { name: 'задачи', hash: '#/tasks' },
  { name: 'ключи', hash: '#/keys' },
  { name: 'справочник', hash: '#/reference' },
].filter((s) => !ONLY || ONLY.includes(s.name));

// Шкалы DESIGN.md (дублируют scripts/design-lib.ts: этот файл — обычный JS, без сборки TS)
const OK = LOOK_A ? {
  radius: [8, 28],
  fontSize: [15, 16, 20, 24, 40],
  fontWeight: [400, 500, 600, 650],
  gap: { 1280: 16, 375: 16 },
  hero: 36, // заставка «Сегодня» 36–44
} : {
  radius: [12, 20],
  fontSize: [15, 17, 20, 26, 36, 44],
  fontWeight: [400, 500, 600],
  gap: { 1280: 24, 375: 16 },
  hero: 38, // заставка «Сегодня» 38–60
};

function measure() {
  const root = document.querySelector('.page') ?? document.body;
  const visible = (el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0 && r.width > 1 && r.height > 1;
  };
  const label = (el) => (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/)[0] : el.tagName.toLowerCase());
  const radii = {}, sizes = {}, weights = {}, families = {};
  const add = (map, key, el) => { (map[key] ??= new Set()).add(label(el)); };
  for (const el of root.querySelectorAll('*')) {
    if (!visible(el) || el.closest('.visually-hidden, .sr-only')) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const painted = (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') || cs.backgroundImage !== 'none'
      || parseFloat(cs.borderTopWidth) > 0 || cs.boxShadow !== 'none';
    const rad = parseFloat(cs.borderTopLeftRadius) || parseFloat(cs.borderTopRightRadius) || parseFloat(cs.borderBottomLeftRadius);
    if (painted && rad > 0) add(radii, rad >= Math.min(r.width, r.height) / 2 - 0.5 ? 'круг' : `${Math.round(rad * 10) / 10}`, el);
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (ownText) {
      add(sizes, `${Math.round(parseFloat(cs.fontSize) * 10) / 10}`, el);
      add(weights, cs.fontWeight, el);
      add(families, cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(), el);
    }
  }
  // Промежутки между блоками: прямые дети .page (и дети сеток/стопок внутри них), подряд по вертикали в одной колонке
  const gaps = {};
  const blocks = [...root.children].filter(visible);
  const lists = [blocks, ...blocks.filter((b) => ['grid', 'flex'].includes(getComputedStyle(b).display) && getComputedStyle(b).flexDirection !== 'row').map((b) => [...b.children].filter(visible))];
  for (const list of lists) {
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1].getBoundingClientRect(), b = list[i].getBoundingClientRect();
      if (b.top < a.bottom - 1 || Math.abs(a.left - b.left) > 2) continue; // не под соседом — другая колонка
      const g = Math.round(b.top - a.bottom);
      (gaps[g] ??= new Set()).add(`${label(list[i - 1])} → ${label(list[i])}`);
    }
  }
  // Левые края: блоки .page и текст заголовков (h1–h3) — сколько разных вертикалей
  const edges = {};
  for (const b of blocks) (edges[Math.round(b.getBoundingClientRect().left)] ??= new Set()).add(label(b));
  for (const h of root.querySelectorAll('h1, h2, h3')) {
    if (!visible(h) || h.closest('.panel, .card, .hero, .today-hello, [class*="sheet"]')) continue; // заголовок внутри листа — у листа свои поля
    const rg = document.createRange(); rg.selectNodeContents(h);
    const x = Math.round(rg.getClientRects()[0]?.left ?? h.getBoundingClientRect().left);
    (edges[x] ??= new Set()).add(`текст ${h.tagName.toLowerCase()} «${h.textContent.trim().slice(0, 20)}»`);
  }
  const plain = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, [...v].slice(0, 5)]));
  return { radii: plain(radii), sizes: plain(sizes), weights: plain(weights), families: plain(families), gaps: plain(gaps), edges: plain(edges) };
}

const browser = await chromium.launch();
const result = {};
try {
  for (const w of [1280, 375]) {
    const ctx = await browser.newContext(w === 375
      ? { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }
      : { viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}${BASE.includes('?') ? '&' : '?'}demo=1&theme=light&look=${LOOK_A ? 'a' : 'old'}`, { waitUntil: 'load' });
    await page.waitForSelector('.page', { timeout: 30000 });
    await page.waitForTimeout(2500);
    for (const s of SCREENS) {
      await page.evaluate((h) => { location.hash = h; window.scrollTo(0, 0); }, s.hash);
      await page.waitForTimeout(1800); // появление строк и пересчёт чисел — дольше самой длинной анимации (0,7 с)
      const m = await page.evaluate(measure);
      const key = `${s.name} ${w}`;
      const offRadius = Object.keys(m.radii).filter((k) => k !== 'круг' && !OK.radius.includes(+k));
      const offSize = Object.keys(m.sizes).filter((k) => !OK.fontSize.includes(+k) && !(s.name === 'сегодня' && +k >= OK.hero));
      const offWeight = Object.keys(m.weights).filter((k) => !OK.fontWeight.includes(+k));
      result[key] = { ...m, offRadius, offSize, offWeight };
      const n = (o) => Object.keys(o).length;
      console.log(`${key.padEnd(16)} радиусов ${n(m.radii)} [${Object.keys(m.radii).join(', ')}] · размеров ${n(m.sizes)} [${Object.keys(m.sizes).sort((a, b) => a - b).join(', ')}]`
        + ` · начертаний ${n(m.weights)} · семейств ${n(m.families)} · промежутков ${n(m.gaps)} [${Object.keys(m.gaps).sort((a, b) => a - b).join(', ')}]`
        + ` · краёв ${n(m.edges)} [${Object.keys(m.edges).sort((a, b) => a - b).join(', ')}]`
        + ` · вне шкалы: радиусы ${offRadius.length}, размеры ${offSize.length}, начертания ${offWeight.length}`);
      if (OUT) {
        mkdirSync(OUT, { recursive: true });
        await page.screenshot({ path: join(OUT, `${s.name}-${w}.png`), fullPage: true, animations: 'disabled' });
      }
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(result, null, 2));
