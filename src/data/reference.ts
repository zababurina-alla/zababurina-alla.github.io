// Справочник с сервера: ставки (reference.rates) и КВЕД (reference.kved). Цифр ставок в коде сайта нет — только
// ответ сервера (на выдуманных данных — выдуманного). Ставки держим 10 мин, как сервер держит свой кэш листа.
// Первое открытие шло 5–10 с (п. 45): ставки — публичные цифры, не данные клиентов, поэтому прошлый ответ лежит в
// localStorage и показывается сразу, а свежий подтягивается в фоне. Ответы поиска КВЕД помним до закрытия вкладки.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CabinetApi, KvedAll, KvedFound } from './api';
import { searchKved } from '../lib/kvedLocal';
import { api } from './session';
import type { Rates } from './types';
import { kvedQuery } from '../lib/kvedQuery';
import { kvedLookup, kvedMap } from '../lib/kvedLookup';

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

// Весь лист КВЕДов — публичные данные (не клиенты): localStorage на 24 ч, дальше ищем в браузере мгновенно (п. 45).
const KVED_KEY = 'buh.kved.v1';
const KVED_TTL_MS = 24 * 3600_000;
let kvedAll: KvedAll | null = (() => {
  try {
    const raw = localStorage.getItem(KVED_KEY);
    const v = raw ? JSON.parse(raw) as { at?: number; data?: KvedAll } : null;
    return v?.data && Array.isArray(v.data.items) && typeof v.at === 'number' && Date.now() - v.at < KVED_TTL_MS ? v.data : null;
  } catch {
    return null;
  }
})();
let kvedLoading: Promise<KvedAll | null> | null = null;

function loadKvedAll(): Promise<KvedAll | null> {
  if (kvedAll) return Promise.resolve(kvedAll);
  kvedLoading ??= api.referenceKvedAll().then((data) => {
    kvedAll = data;
    try { localStorage.setItem(KVED_KEY, JSON.stringify({ at: Date.now(), data })); } catch { /* в памяти */ }
    return data;
  }, () => null).finally(() => { kvedLoading = null; });
  return kvedLoading;
}

/** Весь лист, когда пришёл; null — ещё идёт или сервер его не отдаёт (тогда ищем запросом, как раньше). */
function useKvedAll(): KvedAll | null {
  const [all, setAll] = useState<KvedAll | null>(kvedAll);
  useEffect(() => {
    if (all) return;
    let alive = true;
    void loadKvedAll().then((d) => { if (alive && d) setAll(d); });
    return () => { alive = false; };
  }, [all]);
  return all;
}

/** Названия КВЕД по коду из листа «📑 КВЕДы» (тот же весь лист, что для поиска): у клиента в карточке названия часто нет
 *  («название не указано», владелец 16.10) — берём отсюда. Лист ещё не пришёл — пустая карта. */
export function useKvedTitles(): { get: (code: string) => string | undefined } {
  const all = useKvedAll();
  // Тем же откатом, что таблица: точный код → группа «XX.X» → раздел «XX» (lib/kvedLookup) — в листе многие коды группами.
  return useMemo(() => {
    const map = kvedMap((all?.items ?? []).filter((k) => k.title), (k) => k.code);
    return { get: (code: string) => kvedLookup(map, code)?.title };
  }, [all]);
}

/** Поиск КВЕД на сервере: ждём паузу в наборе 300 мс; меньше двух знаков — не ищем. Запрос приводится к виду листа
 *  («96,02» → «96.02», «парикмахер» → «перукар» — lib/kvedQuery). Ответ помнит, на какой запрос он. */
export function useKvedSearch(q: string): Loaded<KvedFound> {
  const t = q.trim();
  const sent = kvedQuery(t);
  const all = useKvedAll();
  const [res, setRes] = useState<{ q: string; st: Loaded<KvedFound> } | null>(null);
  useEffect(() => {
    if (t.length < 2 || found.has(sent) || all) return;
    let alive = true;
    const timer = setTimeout(() => {
      api.referenceKved(sent).then(
        (data) => { found.set(sent, data); if (alive) setRes({ q: sent, st: { state: 'ok', data } }); },
        (e: unknown) => { if (alive) setRes({ q: sent, st: { state: 'error', message: failText(e) } }); },
      );
    }, 300);
    return () => { alive = false; clearTimeout(timer); };
  }, [t, sent, all]);
  if (t.length < 2) return { state: 'idle' };
  if (all) return { state: 'ok', data: searchKved(all.items, t) };
  const known = found.get(sent);
  if (known) return { state: 'ok', data: known };
  return res && res.q === sent ? res.st : { state: 'loading' };
}
