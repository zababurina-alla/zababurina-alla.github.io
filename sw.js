// Сервис-воркер «Бухгалтерии»: только оболочка сайта — страница, файлы сборки, иконки, шрифты.
// Данные клиентов сюда не попадают: запросы к таблице — POST на script.google.com (другой адрес), их не трогаем;
// кэшируем только GET своего сайта (бриф: данных клиентов на устройстве не хранить).
// Страница и config.json — сначала сеть (новая сборка и включённые разделы видны сразу), кэш — только без связи.
// Файлы сборки (assets/*) с хэшем в имени не меняются — из кэша.
const CACHE = 'buh-shell-v2';
const MAX_ASSETS = 80;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

// Страница одна, адреса разные (?demo=1, ?v=…): храним её под одним ключом — корнем сайта, а не под каждым адресом.
const keyOf = (req) => (req.mode === 'navigate' ? new Request(self.registration.scope) : req);

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) await cache.put(keyOf(req), res.clone());
    return res;
  } catch {
    const hit = await cache.match(keyOf(req));
    if (hit) return hit;
    throw new Error('Нет связи');
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    await cache.put(req, res.clone());
    // Старые сборки не копим: самые давние файлы — вон.
    const keys = (await cache.keys()).filter((k) => new URL(k.url).pathname.includes('/assets/'));
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))) await cache.delete(k);
  }
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Google, таблица — мимо
  if (req.mode === 'navigate' || url.pathname.endsWith('/config.json') || url.pathname.endsWith('/manifest.webmanifest')) {
    e.respondWith(networkFirst(req));
    return;
  }
  if (url.pathname.includes('/assets/') || url.pathname.includes('/icons/') || url.pathname.endsWith('/favicon.svg')) {
    e.respondWith(cacheFirst(req));
  }
});
