// Справочник с сервера: ставки (reference.rates) и КВЕД (reference.kved). Цифр ставок в коде сайта нет — только
// ответ сервера (на выдуманных данных — выдуманного). Ставки держим 10 мин, как сервер держит свой кэш листа.
// Первое открытие шло 5–10 с (п. 45): ставки — публичные цифры, не данные клиентов, поэтому прошлый ответ лежит в
// localStorage и показывается сразу, а свежий подтягивается в фоне. Ответы поиска КВЕД помним до закрытия вкладки.
import { useCallback, useEffect, useState } from 'react';
import type { CabinetApi, KvedFound } from './api';
import { api } from './session';
import type { Rates } from './types';
import { kvedQuery } from '../lib/kvedQuery';

export type Loaded<T> = { state: 'idle' } | { state: 'loading' } | { state: 'ok'; data: T } | { state: 'error'; message: string };

const TTL_MS = 10 * 60_000;
const KEY = 'buh.rates.v1';

function readSaved(): { at: number; rates: Rates } | null {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) as { at?: unknown; rates?: unknown } : null;
    return v && typeof v.at === 'number' && v.rates && typeof v.rates === 'object' ? { at: v.at, rates: v.rates as Rates } : null;
  } catch {
    return null;
  }
}

let cache: { at: number; rates: Rates } | null = readSaved();
let inflight: Promise<Rates> | null = null;

/** Один запрос на всех: «Справочник» и «Добавить клиента» открываются рядом. */
export function loadRates(from: CabinetApi = api, now = Date.now()): Promise<Rates> {
  if (cache && now - cache.at < TTL_MS) return Promise.resolve(cache.rates);
  inflight ??= from.referenceRates()
    .then((rates) => {
      cache = { at: Date.now(), rates };
      try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* частный режим — останется в памяти */ }
      return rates;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

/** Для тестов. */
export function resetRatesCache(): void { cache = null; inflight = null; }

const failText = (e: unknown) => (e instanceof Error && e.name === 'ApiError' && e.message ? e.message : 'Таблица не ответила. Проверьте связь и нажмите «Ещё раз».');

/** Ставки: сохранённые — сразу, свежие — когда придут. Не пришли, а сохранённые есть — остаёмся на сохранённых. */
export function useRates(): Loaded<Rates> & { retry: () => void } {
  const [st, setSt] = useState<Loaded<Rates>>(() => (cache ? { state: 'ok', data: cache.rates } : { state: 'loading' }));
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    loadRates().then(
      (data) => { if (alive) setSt({ state: 'ok', data }); },
      (e: unknown) => { if (alive) setSt((cur) => (cur.state === 'ok' ? cur : { state: 'error', message: failText(e) })); },
    );
    return () => { alive = false; };
  }, [attempt]);
  const retry = useCallback(() => { setSt({ state: 'loading' }); setAttempt((a) => a + 1); }, []);
  return { ...st, retry };
}

const found = new Map<string, KvedFound>();

/** Поиск КВЕД на сервере: ждём паузу в наборе 300 мс; меньше двух знаков — не ищем. Запрос приводится к виду листа
 *  («96,02» → «96.02», «парикмахер» → «перукар» — lib/kvedQuery). Ответ помнит, на какой запрос он. */
export function useKvedSearch(q: string): Loaded<KvedFound> {
  const t = q.trim();
  const sent = kvedQuery(t);
  const [res, setRes] = useState<{ q: string; st: Loaded<KvedFound> } | null>(null);
  useEffect(() => {
    if (t.length < 2 || found.has(sent)) return;
    let alive = true;
    const timer = setTimeout(() => {
      api.referenceKved(sent).then(
        (data) => { found.set(sent, data); if (alive) setRes({ q: sent, st: { state: 'ok', data } }); },
        (e: unknown) => { if (alive) setRes({ q: sent, st: { state: 'error', message: failText(e) } }); },
      );
    }, 300);
    return () => { alive = false; clearTimeout(timer); };
  }, [t, sent]);
  if (t.length < 2) return { state: 'idle' };
  const known = found.get(sent);
  if (known) return { state: 'ok', data: known };
  return res && res.q === sent ? res.st : { state: 'loading' };
}
