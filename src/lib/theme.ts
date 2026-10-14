// Тема — одно место на всё приложение: меню, командная строка и <meta name="theme-color"> видят одно и то же.
// Выбор запоминается в этом браузере (localStorage); без выбора — по настройке системы (index.html).
const listeners = new Set<() => void>();
const META_COLOR = { light: '#F6F7F9', dark: '#0B0D12' } as const; // = --canvas из tokens.css

export function getTheme(): 'light' | 'dark' {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function setTheme(t: 'light' | 'dark'): void {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLOR[t]);
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
