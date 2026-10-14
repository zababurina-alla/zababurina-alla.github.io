import { useSyncExternalStore } from 'react';

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

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseHash(hash);
}
