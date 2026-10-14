// Маленькое хранилище «ключ → значение» в IndexedDB для очереди записей и черновиков форм.
// Только то, что ещё не в таблице, и черновики; данные клиентов здесь не хранятся, пароли — никогда (бриф, п. 4, 6б).
// Если IndexedDB недоступен (частный режим, тесты) — работает в памяти и честно говорит об этом через `persistent`.

const DB = 'sverka';
const VERSION = 1;
export type StoreName = 'outbox' | 'drafts';

let dbPromise: Promise<IDBDatabase> | null = null;
const memory: Record<StoreName, Map<string, unknown>> = { outbox: new Map(), drafts: new Map() };

export const persistent = typeof indexedDB !== 'undefined';

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of ['outbox', 'drafts']) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB не открылся'));
  });
  return dbPromise;
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const req = run(db.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Ошибка IndexedDB'));
  }));
}

export async function kvSet(store: StoreName, key: string, value: unknown): Promise<void> {
  if (!persistent) { memory[store].set(key, value); return; }
  try { await tx(store, 'readwrite', (s) => s.put(value, key)); } catch { memory[store].set(key, value); }
}

export async function kvGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  if (!persistent) return memory[store].get(key) as T | undefined;
  try { return (await tx<T | undefined>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>)); } catch { return memory[store].get(key) as T | undefined; }
}

export async function kvDelete(store: StoreName, key: string): Promise<void> {
  memory[store].delete(key);
  if (!persistent) return;
  try { await tx(store, 'readwrite', (s) => s.delete(key)); } catch { /* в памяти уже удалено */ }
}

export async function kvAll<T>(store: StoreName): Promise<T[]> {
  if (!persistent) return [...memory[store].values()] as T[];
  try { return await tx<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>); } catch { return [...memory[store].values()] as T[]; }
}
