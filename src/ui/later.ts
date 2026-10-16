// «Позже» для вопросов по таблице — только на этом сайте и в этом браузере (localStorage), таблица не знает:
// решение координатора 15.10.2026. Вопрос не пропадает — уходит в свёрнутый список «Отложенные» до ответа.
import { useSyncExternalStore } from 'react';

const KEY = 'cab.questions.later';
const listeners = new Set<() => void>();
let cache: string[] | null = null;

function read(): string[] {
  if (cache) return cache;
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? '[]') as unknown;
    cache = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(ids: string[]): void {
  cache = ids;
  try { window.localStorage.setItem(KEY, JSON.stringify(ids)); } catch { /* частный режим — запомнится до перезагрузки */ }
  listeners.forEach((l) => l());
}

export function setLater(id: string, later: boolean): void {
  const cur = read().filter((x) => x !== id);
  write(later ? [...cur, id] : cur);
}

export function useLater(): string[] {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, read, () => []);
}
