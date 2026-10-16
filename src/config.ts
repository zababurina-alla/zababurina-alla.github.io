// Настройки подключения к живой таблице. Читаются при запуске из config.json рядом с сайтом — включить живые данные
// или открыть запись в разделе можно правкой этого файла, без пересборки. Значения публичные по природе (адрес
// веб-приложения и client ID всё равно видны в коде страницы); секретов здесь нет и быть не должно.
// Пустой адрес — сайт на выдуманном сервере (src/data/fakeServer.ts).

/** Разделы, запись в которых можно включать по одному (сервер готовит их по очереди). */
// remind — напоминания клиентам (clients.remind): отдельно от сроков, включается своим «да» (координатор 15.10).
export type WriteArea = 'payments' | 'tasks' | 'questions' | 'deadlines' | 'clients' | 'inbox' | 'remind' | 'consultations';
export const WRITE_AREAS: readonly WriteArea[] = ['payments', 'tasks', 'questions', 'deadlines', 'clients', 'inbox', 'remind', 'consultations'];

/** Возможности, которые включаются, когда их готов отдавать сервер. На выдуманных данных — все. */
/** remindPreview — сервер умеет clients.remind { preview:true } (пробный, без отправки). Без флага не зовём:
 *  старый сервер флаг не знает и отправил бы настоящее сообщение. */
export type Feature = 'inbox' | 'remindPreview' | 'cancelNotify' | 'deadlinesCreate' | 'applyTemplate' | 'botLink' | 'statementPdf' | 'sendStatement';
const FEATURES: readonly Feature[] = ['inbox', 'remindPreview', 'cancelNotify', 'deadlinesCreate', 'applyTemplate', 'botLink', 'statementPdf', 'sendStatement'];

/** OAuth client ID проекта Google Cloud «zababurina-alla» (…apps.googleusercontent.com). */
export const GOOGLE_CLIENT_ID = '1078049272948-bnvonl9qah7npdq63gktbio1rm2lbgvb.apps.googleusercontent.com';

interface Runtime { apiUrl: string; writes: WriteArea[]; features: Feature[] }
let runtime: Runtime = { apiUrl: '', writes: [...WRITE_AREAS], features: [] };

const isArea = (x: unknown): x is WriteArea => typeof x === 'string' && (WRITE_AREAS as readonly string[]).includes(x);

/** config.json: { "apiUrl": "https://script.google.com/macros/s/…/exec", "writes": ["payments", "tasks"] }.
 *  Нет файла или он битый — выдуманные данные; нет "writes" — запись во всех разделах; [] — только просмотр. */
export async function loadRuntimeConfig(fetchImpl: typeof fetch = fetch, mode: string = import.meta.env.MODE): Promise<void> {
  // npm run dev:mock — только учебный сервер, что бы ни лежало в config*.json: закоммиченный config.json несёт адрес
  // ЖИВОЙ таблицы, и без этого dev:mock на чистой копии ходил в неё (находка «Качества» Н-7, 15.10.2026).
  // На учебном всё включено — иначе там нечего проверять.
  if (mode === 'mock') { runtime = { apiUrl: '', writes: [...WRITE_AREAS], features: [...FEATURES] }; return; }
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
      features: Array.isArray(j.features) ? j.features.filter((f): f is Feature => (FEATURES as readonly unknown[]).includes(f)) : [],
    };
  } catch {
    // нет связи или файл битый — остаёмся на выдуманных данных
  }
}

/** Какой адрес API главнее: в режиме mock — всегда учебный сервер (VITE_API_URL из vite.config.ts), иначе — адрес из
 *  config*.json, а без него — VITE_API_URL. */
export function pickApiUrl(mode: string, fromConfig: string, fromEnv: string): string {
  return mode === 'mock' ? fromEnv : fromConfig || fromEnv;
}

/** POST-адрес Apps Script. Для проверки у себя — npm run dev:mock (адрес учебного сервера задаёт vite.config.ts). */
export function apiUrl(): string {
  return pickApiUrl(import.meta.env.MODE, runtime.apiUrl, import.meta.env.VITE_API_URL ?? '');
}

/** Учебный режим: всё «в таблице» — в учебной (находка «Пользователя» № 3: «записано в таблицу» было неправдой). */
export function demoWords(s: string): string {
  return isLive() ? s : s.replace(/ в таблицу/g, ' в учебную таблицу').replace(/ в таблице/g, ' в учебной таблице');
}

/** Учебный режим включён ссылкой ?demo=1 на сайте, где есть настоящий кабинет, — из него можно выйти. */
export function canLeaveDemo(): boolean {
  return Boolean(apiUrl() && GOOGLE_CLIENT_ID) && !isLive();
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

/** Бот, где мама отвечает на вопросы и решает сообщения, пока на сайте это выключено (публичное имя бота). */
export const BOT_URL = 'https://t.me/za_control_bot';

/** Где это делать, пока раздел на сайте только для просмотра. */
export const AREA_PLACE: Record<WriteArea, 'table' | 'telegram'> = {
  payments: 'table', tasks: 'table', questions: 'telegram', deadlines: 'table', clients: 'table', inbox: 'telegram', remind: 'telegram',
  consultations: 'telegram',
};

export const AREA_LABEL: Record<WriteArea, string> = {
  payments: 'платежи', tasks: 'задачи', questions: 'ответы на вопросы', deadlines: 'сроки', clients: 'клиенты', inbox: 'входящие', remind: 'напоминания клиентам', consultations: 'консультации',
};
