// Прочитанность чатов «Входящих» — у мамы в браузере (localStorage): { ключ чата: время последнего прочитанного }.
// Не данные клиентов: только ключи и время. Позже переедет на сервер (координатор 16.10) — тогда это станет запасом.
import { useSyncExternalStore } from 'react';

const KEY = 'buh.inbox.read.v1';
const listeners = new Set<() => void>();

function load(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown;
    return v && typeof v === 'object' ? v as Record<string, string> : {};
  } catch {
    return {};
  }
}

let state: Record<string, string> = typeof window === 'undefined' ? {} : load();

/** Отметить чат прочитанным до времени at (последнее сообщение в нём). */
export function markRead(key: string, at: string): void {
  if ((state[key] ?? '') >= at) return;
  state = { ...state, [key]: at };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* частный режим — до закрытия вкладки */ }
  for (const l of listeners) l();
}

export function useReadAt(): Readonly<Record<string, string>> {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state);
}

/** Для тестов. */
export function resetRead(): void { state = {}; for (const l of listeners) l(); }
