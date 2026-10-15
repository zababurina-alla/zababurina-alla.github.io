// Настройки подключения к живой таблице. Читаются при запуске из config.json рядом с сайтом — включить живые данные
// или открыть запись в разделе можно правкой этого файла, без пересборки. Значения публичные по природе (адрес
// веб-приложения и client ID всё равно видны в коде страницы); секретов здесь нет и быть не должно.
// Пустой адрес — сайт на выдуманном сервере (src/data/fakeServer.ts).

/** Разделы, запись в которых можно включать по одному (сервер готовит их по очереди). */
// remind — напоминания клиентам (clients.remind): отдельно от сроков, включается своим «да» (координатор 15.10).
export type WriteArea = 'payments' | 'tasks' | 'questions' | 'deadlines' | 'clients' | 'inbox' | 'remind';
export const WRITE_AREAS: readonly WriteArea[] = ['payments', 'tasks', 'questions', 'deadlines', 'clients', 'inbox', 'remind'];

/** Возможности, которые включаются, когда их готов отдавать сервер. На выдуманных данных — все. */
/** remindPreview — сервер умеет clients.remind { preview:true } (пробный, без отправки). Без флага не зовём:
 *  старый сервер флаг не знает и отправил бы настоящее сообщение. */
export type Feature = 'inbox' | 'remindPreview';

/** OAuth client ID проекта Google Cloud «zababurina-alla» (…apps.googleusercontent.com). */
export const GOOGLE_CLIENT_ID = '1078049272948-bnvonl9qah7npdq63gktbio1rm2lbgvb.apps.googleusercontent.com';

interface Runtime { apiUrl: string; writes: WriteArea[]; features: Feature[] }
let runtime: Runtime = { apiUrl: '', writes: [...WRITE_AREAS], features: [] };

const isArea = (x: unknown): x is WriteArea => typeof x === 'string' && (WRITE_AREAS as readonly string[]).includes(x);

/** config.json: { "apiUrl": "https://script.google.com/macros/s/…/exec", "writes": ["payments", "tasks"] }.
 *  Нет файла или он битый — выдуманные данные; нет "writes" — запись во всех разделах; [] — только просмотр. */
export async function loadRuntimeConfig(fetchImpl: typeof fetch = fetch): Promise<void> {
  try {
    // Локальная проверка против тестовой копии таблицы: public/config.local.json (в .gitignore, из сборки удаляется).
    // Читается только в режиме разработки — на опубликованном сайте его нет и быть не может.
    let r = import.meta.env.DEV ? await fetchImpl('./config.local.json', { cache: 'no-store' }) : null;
    const local = r?.ok && (r.headers.get('content-type') ?? '').includes('json');
    if (!local) r = await fetchImpl('./config.json', { cache: 'no-store' });
    if (!r || !r.ok) return;
    const j = await r.json() as { apiUrl?: unknown; writes?: unknown; features?: unknown };
    runtime = {
      apiUrl: typeof j.apiUrl === 'string' ? j.apiUrl.trim() : '',
      writes: Array.isArray(j.writes) ? j.writes.filter(isArea) : [...WRITE_AREAS],
      features: Array.isArray(j.features) ? j.features.filter((f): f is Feature => f === 'inbox' || f === 'remindPreview') : [],
    };
  } catch {
    // нет связи или файл битый — остаёмся на выдуманных данных
  }
}

/** POST-адрес Apps Script. Для проверки у себя — npm run dev:mock (адрес учебного сервера задаёт vite.config.ts). */
export function apiUrl(): string {
  return runtime.apiUrl || (import.meta.env.VITE_API_URL ?? '');
}

/** Живой режим: адрес задан и не включён показ на выдуманных данных (?demo=1). */
export function isLive(): boolean {
  if (!apiUrl() || !GOOGLE_CLIENT_ID) return false;
  try {
    return new URLSearchParams(window.location.search).get('demo') !== '1';
  } catch {
    return true;
  }
}

/** Можно ли записывать с сайта в этот раздел. На выдуманных данных — всегда. */
export function canWrite(area: WriteArea): boolean {
  return !isLive() || runtime.writes.includes(area);
}

/** Возможность включена: на выдуманных данных — всегда, на живых — если есть в config.json → features. */
export function hasFeature(f: Feature): boolean {
  return !isLive() || runtime.features.includes(f);
}

/** Разделы, которые сейчас есть на сайте: «Входящие» — только когда включены флагом. */
export function visibleAreas(): WriteArea[] {
  return WRITE_AREAS.filter((a) => a !== 'inbox' || hasFeature('inbox'));
}

/** Разделы, где на живых данных пока только просмотр. */
export function readOnlyAreas(): WriteArea[] {
  return isLive() ? visibleAreas().filter((a) => !runtime.writes.includes(a)) : [];
}

export const AREA_LABEL: Record<WriteArea, string> = {
  payments: 'платежи', tasks: 'задачи', questions: 'ответы на вопросы', deadlines: 'сроки', clients: 'клиенты', inbox: 'входящие', remind: 'напоминания клиентам',
};
