// «Входящие» как Telegram: сообщения собираются в чаты по клиенту, чаты — по последнему сообщению (свежее сверху),
// у чата — число непрочитанных. Прочитанность хранит браузер мамы (inboxRead.ts): «прочитано всё до такого-то времени».
import type { InboxItem } from '../data/types';

export interface Thread {
  /** Ключ чата: clientId, а без клиента — «?имя» (сервер не знает, чей номер). Он же в адресе #/inbox/<ключ>. */
  key: string;
  clientId: string | null;
  name: string;
  /** Сообщения по времени, старые сверху — как в диалоге. */
  items: InboxItem[];
  last: InboxItem;
  unread: number;
  /** Сколько ещё ждёт решения (статус «новое»). */
  open: number;
}

export const threadKey = (it: Pick<InboxItem, 'clientId' | 'clientName'>): string => it.clientId ?? `?${it.clientName.trim()}`;

/** readAt[ключ] — время, до которого чат прочитан (ISO). Непрочитанное — позже этого времени. */
export function groupThreads(items: InboxItem[], readAt: Readonly<Record<string, string>>): Thread[] {
  const map = new Map<string, InboxItem[]>();
  for (const it of items) {
    const k = threadKey(it);
    const xs = map.get(k);
    if (xs) xs.push(it); else map.set(k, [it]);
  }
  const threads: Thread[] = [];
  for (const [key, xs] of map) {
    xs.sort((a, b) => a.at.localeCompare(b.at));
    const last = xs[xs.length - 1];
    if (!last) continue;
    const seen = readAt[key] ?? '';
    threads.push({
      key, clientId: last.clientId, name: last.clientName, items: xs, last,
      unread: xs.filter((x) => x.at > seen).length,
      open: xs.filter((x) => x.status === 'new').length,
    });
  }
  return threads.sort((a, b) => b.last.at.localeCompare(a.last.at));
}
