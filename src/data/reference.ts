// Справочник с сервера: ставки (reference.rates) и КВЕД (reference.kved). Цифр ставок в коде сайта нет — только
// ответ сервера (на выдуманных данных — выдуманного). Ставки держим 10 мин, как сервер держит свой кэш листа.
import { useCallback, useEffect, useState } from 'react';
import type { CabinetApi } from './api';
import { api } from './session';
import type { KvedItem, Rates } from './types';

export type Loaded<T> = { state: 'idle' } | { state: 'loading' } | { state: 'ok'; data: T } | { state: 'error'; message: string };

const TTL_MS = 10 * 60_000;
let cache: { at: number; rates: Rates } | null = null;
let inflight: Promise<Rates> | null = null;

/** Один запрос на всех: «Справочник» и «Добавить клиента» открываются рядом. */
export function loadRates(from: CabinetApi = api, now = Date.now()): Promise<Rates> {
  if (cache && now - cache.at < TTL_MS) return Promise.resolve(cache.rates);
  inflight ??= from.referenceRates()
    .then((rates) => { cache = { at: Date.now(), rates }; return rates; })
    .finally(() => { inflight = null; });
  return inflight;
}

/** Для тестов. */
export function resetRatesCache(): void { cache = null; inflight = null; }

const failText = (e: unknown) => (e instanceof Error && e.name === 'ApiError' && e.message ? e.message : 'Таблица не ответила. Проверьте связь и нажмите «Ещё раз».');

export function useRates(): Loaded<Rates> & { retry: () => void } {
  const [st, setSt] = useState<Loaded<Rates>>(() => (cache ? { state: 'ok', data: cache.rates } : { state: 'loading' }));
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    loadRates().then((data) => { if (alive) setSt({ state: 'ok', data }); }, (e: unknown) => { if (alive) setSt({ state: 'error', message: failText(e) }); });
    return () => { alive = false; };
  }, [attempt]);
  const retry = useCallback(() => { setSt({ state: 'loading' }); setAttempt((a) => a + 1); }, []);
  return { ...st, retry };
}

/** Поиск КВЕД на сервере: ждём паузу в наборе 300 мс; меньше двух знаков — не ищем. Ответ помнит, на какой запрос он:
 *  пока набор не совпал с ответом — «ищу». */
export function useKvedSearch(q: string): Loaded<KvedItem[]> {
  const t = q.trim();
  const [res, setRes] = useState<{ q: string; st: Loaded<KvedItem[]> } | null>(null);
  useEffect(() => {
    if (t.length < 2) return;
    let alive = true;
    const timer = setTimeout(() => {
      api.referenceKved(t).then(
        (data) => { if (alive) setRes({ q: t, st: { state: 'ok', data } }); },
        (e: unknown) => { if (alive) setRes({ q: t, st: { state: 'error', message: failText(e) } }); },
      );
    }, 300);
    return () => { alive = false; clearTimeout(timer); };
  }, [t]);
  if (t.length < 2) return { state: 'idle' };
  return res && res.q === t ? res.st : { state: 'loading' };
}
