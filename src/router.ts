import { useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';

// Маршруты через «#/…»: GitHub Pages отдаёт один index.html, и обновление страницы не даёт 404.
export const ROUTES = ['today', 'clients', 'deadlines', 'payments', 'tasks', 'keys', 'reference', 'more', 'icons'] as const;
export type RouteName = (typeof ROUTES)[number];

export interface Route {
  name: RouteName;
  /** Остаток пути после имени экрана, например id клиента в «#/clients/42». */
  params: string[];
}

const DEFAULT_ROUTE: Route = { name: 'today', params: [] };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [head, ...params] = parts;
  if (head && (ROUTES as readonly string[]).includes(head)) {
    return { name: head as RouteName, params };
  }
  return DEFAULT_ROUTE;
}

export function toHash(route: Route): string {
  return `#/${[route.name, ...route.params].map(encodeURIComponent).join('/')}`;
}

// Своё хранилище адреса: переход внутри приложения меняет его синхронно — это нужно, чтобы браузер
// снял «до» и «после» для плавной смены экрана (View Transitions). Назад/вперёд — через hashchange.
let current = typeof window === 'undefined' ? '' : window.location.hash;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const onHash = () => { current = window.location.hash; emit(); };
  window.addEventListener('hashchange', onHash);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('hashchange', onHash);
  };
}

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Плавно выполнить изменение интерфейса: браузер сам перетекает между снимками «до» и «после». */
export function withTransition(update: () => void, kind = 'screen'): void {
  if (!document.startViewTransition || reduced()) {
    update();
    return;
  }
  document.documentElement.dataset.vt = kind;
  const t = document.startViewTransition(() => flushSync(update));
  void t.finished.finally(() => { delete document.documentElement.dataset.vt; });
}

export function navigate(hash: string): void {
  if (hash === current) return;
  withTransition(() => {
    window.history.pushState(null, '', hash);
    current = hash;
    emit();
  });
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => current);
  return parseHash(hash);
}
