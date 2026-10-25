// Тема — одно место на всё приложение: меню, командная строка и <meta name="theme-color"> видят одно и то же.
// Выбор запоминается в этом браузере (localStorage); без выбора — по настройке системы (index.html).
import { isLookA } from './look';

const listeners = new Set<() => void>();
const META_COLOR = { light: '#ECEEF1', dark: '#07090C' } as const; // = --canvas из tokens.css (v2)
const META_COLOR_A = { light: '#F4EFE6', dark: '#1C1A17' } as const; // = --canvas вида A (styles/look-a/tokens.css)

export function getTheme(): 'light' | 'dark' {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function setTheme(t: 'light' | 'dark'): void {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', (isLookA() ? META_COLOR_A : META_COLOR)[t]);
  try { window.localStorage.setItem('sverka.theme', t); } catch { /* не запомнится — не страшно */ }
  listeners.forEach((l) => l());
}

export function toggleTheme(): void {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

export function subscribeTheme(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
