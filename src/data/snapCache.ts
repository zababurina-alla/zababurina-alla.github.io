// Снимок таблицы до закрытия вкладки (sessionStorage): при обновлении страницы экраны видны сразу, свежий снимок
// приходит следом. Только sessionStorage — не IndexedDB и не localStorage: данные клиентов на устройстве после
// закрытия вкладки не остаются (бриф, п. 4, 6б; решение координатора 15.10.2026). «Выйти» стирает сразу.
// Паролей в снимке нет и не бывает (clients.revealPassword — отдельный запрос).
import type { Snapshot } from './api';

const KEY = 'buh.snap.v1';
const MAX_CHARS = 4_000_000; // sessionStorage держит ~5 МБ; больше — просто не храним

export function readSnap(): Snapshot | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    const s = raw ? JSON.parse(raw) as Partial<Snapshot> : null;
    return s && Array.isArray(s.clients) && Array.isArray(s.deadlines) && typeof s.cursor === 'number' ? s as Snapshot : null;
  } catch {
    return null;
  }
}

/** Когда снимок вкладки был свежим (мс) — для «Показываю данные на 09:40» при обрыве. */
export function readSnapAt(): number | null {
  try {
    const n = Number(sessionStorage.getItem(`${KEY}.at`));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function saveSnap(s: Snapshot): void {
  try {
    const raw = JSON.stringify(s);
    if (raw.length <= MAX_CHARS) sessionStorage.setItem(KEY, raw); else sessionStorage.removeItem(KEY);
    sessionStorage.setItem(`${KEY}.at`, String(Date.now()));
  } catch { /* частный режим или переполнено — без кэша, как раньше */ }
}

export function clearSnap(): void {
  try { sessionStorage.removeItem(KEY); sessionStorage.removeItem(`${KEY}.at`); } catch { /* нечего чистить */ }
}
