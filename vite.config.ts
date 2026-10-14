/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { mockApi } from './scripts/mock-api';

// base: './' — сайт живёт на GitHub Pages; маршруты через #/, поэтому 404 не бывает.
// --mode mock (npm run dev:mock) — сайт в живом режиме против учебного сервера scripts/mock-api.ts.
export default defineConfig(({ mode }) => {
  if (mode === 'mock') process.env.MOCK_API = '1';
  return {
    base: './',
    define: mode === 'mock' ? { 'import.meta.env.VITE_API_URL': JSON.stringify('http://localhost:5179/mock-api') } : {},
    // mockApi — учебный сервер по контракту, только в dev и только при MOCK_API=1 (scripts/mock-api.ts).
    plugins: [react(), mockApi()],
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
