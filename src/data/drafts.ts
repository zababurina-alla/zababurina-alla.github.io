// Черновики форм в IndexedDB: введённое не теряется при обрыве связи, закрытии окна или перезагрузке (бриф, п. 4).
// Хранится только то, что мама набирает в форме; пароли и данные клиентов из таблицы сюда не попадают.
import { useEffect, useRef, useState } from 'react';
import { kvDelete, kvGet, kvSet } from './idb';

const SAVE_DEBOUNCE_MS = 300;
// Черновик старше недели не восстанавливаем — порог наш, не проверен.
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

interface Saved<T> { value: T; savedAt: number }

export function useDraft<T>(key: string, open: boolean, value: T, restore: (v: T) => unknown, isEmpty: (v: T) => boolean) {
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  const ready = useRef(false);
  const restoreRef = useRef(restore);
  const isEmptyRef = useRef(isEmpty);
  useEffect(() => { restoreRef.current = restore; isEmptyRef.current = isEmpty; });

  // Открыли форму — подхватить черновик, если он есть.
  useEffect(() => {
    if (!open) { ready.current = false; return; }
    let alive = true;
    void kvGet<Saved<T>>('drafts', key).then((d) => {
      if (!alive) return;
      if (d && Date.now() - d.savedAt < MAX_AGE_MS && !isEmptyRef.current(d.value)) {
        // restore вернул false — черновик к этой форме не подходит (чужой клиент): не подставляем и не пишем «восстановлен».
        setRestoredAt(restoreRef.current(d.value) === false ? null : d.savedAt);
      } else setRestoredAt(null);
      ready.current = true;
    });
    return () => { alive = false; };
  }, [open, key]);

  // Каждое изменение — в черновик (с паузой 300 мс, чтобы не писать на каждую букву).
  useEffect(() => {
    if (!open || !ready.current) return;
    const t = window.setTimeout(() => {
      if (isEmptyRef.current(value)) void kvDelete('drafts', key);
      else void kvSet('drafts', key, { value, savedAt: Date.now() } satisfies Saved<T>);
    }, SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [open, key, value]);

  return {
    restoredAt,
    clear: () => { setRestoredAt(null); return kvDelete('drafts', key); },
  };
}
