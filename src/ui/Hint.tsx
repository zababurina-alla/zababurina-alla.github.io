// Первые подсказки на экранах: «нажмите круг — сдано и оплачено», «нажмите плашку — покажу только эти».
// Тихая пшеничная строка со «Понятно». Убирается навсегда (в этом браузере) после «Понятно» или первого действия,
// которому она учит (dismissHint из обработчика). Решение координатора 15.10.2026, без сервера.
import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';

const KEY = 'cab.hints.seen';
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

export function dismissHint(id: string): void {
  if (read().includes(id)) return;
  cache = [...read(), id];
  try { window.localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* частный режим — до перезагрузки */ }
  listeners.forEach((l) => l());
}

/** after — id подсказки, после которой показывать эту: на экране одна подсказка за раз (п. 57). */
/** «Вернуть подсказки» (помощь, находка № 17): все закрытые подсказки снова видны. */
export function resetHints(): void {
  cache = [];
  try { window.localStorage.removeItem(KEY); } catch { /* частный режим — до перезагрузки */ }
  listeners.forEach((l) => l());
}

export function Hint({ id, after, children }: { id: string; after?: string; children: ReactNode }) {
  const seen = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, read, () => []);
  if (seen.includes(id) || (after && !seen.includes(after))) return null;
  return (
    <p className="hint" role="note">
      <Icon name="tip" size={18} />
      <span>{children}</span>
      <button type="button" className="link hint__ok" onClick={() => dismissHint(id)}>Понятно</button>
    </p>
  );
}
