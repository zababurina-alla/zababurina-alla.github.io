/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { rmSync } from 'node:fs';
import { mockApi } from './scripts/mock-api';

// Строгая политика безопасности страницы (аудит M6). Только в сборке: в разработке Vite сам вставляет встроенные скрипты.
// Встроенных скриптов нет (тема — public/theme-boot.js) — script-src строгий. style-src с 'unsafe-inline': кнопка Google
// ставит атрибуты style своим обёрткам (проверено: без него 2 нарушения на экране входа; позиция окна входа
// держится на них). Наши стили — файлы; стили без скриптов не исполняют код. Google Identity — как в его документации
// (gsi/client, gsi/style, gsi/ во фрейме и запросах).
// Таблица: POST на script.google.com, ответ приходит после переадресации с script.googleusercontent.com.
export const CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com/gsi/client",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self' https://script.google.com https://script.googleusercontent.com https://accounts.google.com/gsi/",
  "frame-src https://accounts.google.com/gsi/",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

// base: './' — сайт живёт на GitHub Pages; маршруты через #/, поэтому 404 не бывает.
// --mode mock (npm run dev:mock) — сайт в живом режиме против учебного сервера scripts/mock-api.ts.
export default defineConfig(({ mode }) => {
  if (mode === 'mock') process.env.MOCK_API = '1';
  return {
    base: './',
    define: mode === 'mock' ? { 'import.meta.env.VITE_API_URL': JSON.stringify('http://localhost:5179/mock-api') } : {},
    // mockApi — учебный сервер по контракту, только в dev и только при MOCK_API=1 (scripts/mock-api.ts).
    plugins: [react(), mockApi(), {
      name: 'csp',
      apply: 'build',
      // Только главная страница: concept.html — старые макеты со своими встроенными скриптами.
      transformIndexHtml(html, ctx) {
        if (!ctx.path.endsWith('/index.html')) return html;
        return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
      },
    }, {
      // public/config.local.json — адрес тестовой копии для локальной проверки; в сборку (и на gh-pages) не попадает.
      name: 'drop-local-config',
      apply: 'build',
      closeBundle() { rmSync('dist/config.local.json', { force: true }); },
    }],
    build: {
      rollupOptions: {
        // concept.html — макеты этапа 1; уберём из сборки перед публикацией.
        input: { main: 'index.html', concept: 'concept.html' },
      },
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    },
  };
});
