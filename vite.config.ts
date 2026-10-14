/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' — сайт живёт на GitHub Pages в подпапке репозитория; маршруты через #/, поэтому 404 не бывает.
export default defineConfig({
  base: './',
  plugins: [react()],
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
});
