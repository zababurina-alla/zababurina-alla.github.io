// Визуальные снимки сайта (Качество, 15.10.2026): каждый экран × свет / тьма × 1280 / 375 на учебном сервере.
// Запуск — npm run visual (README: tests/visual/README.md). Прогон только на этом компьютере: эталоны сняты на Windows,
// на другой машине шрифты дают отличия.
import { defineConfig } from '@playwright/test';

const PORT = 5179;

// Телефон (375) — с касанием, как настоящий: (hover: none) и (pointer: coarse) срабатывают, крупные цели касания видны
// в эталонах. isMobile — мета viewport и мобильная раскладка Chromium; масштаб 1, чтобы снимки остались в css-пикселях.
const shot = (name: string, colorScheme: 'light' | 'dark', width: number, height: number, touch = false) => ({
  name,
  testMatch: /.*\.visual\.ts/,
  use: { colorScheme, viewport: { width, height }, deviceScaleFactor: 1, ...(touch ? { hasTouch: true, isMobile: true } : {}) },
});

export default defineConfig({
  testDir: 'tests/visual',
  outputDir: 'tests/visual/.out',
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  fullyParallel: false,
  workers: 1, // один учебный сервер: записи одного теста не должны попасть в снимок другого
  retries: 1, // занятый ПК: браузер изредка не открывает страницу за 60 с; повтор виден в отчёте как flaky
  timeout: 60_000, // занятый ПК: загрузка + поиск пятен + снимок до 30 с
  reporter: [['list'], ['html', { outputFolder: 'tests/visual/.report', open: 'never' }]],
  expect: {
    // Порог: 0,2 % пикселей и 0,2 по цвету пикселя (0–1) — сглаживание шрифтов не в счёт, сдвиг блока на 8 px — в счёт.
    toHaveScreenshot: { maxDiffPixelRatio: 0.002, threshold: 0.2, animations: 'disabled', caret: 'hide', scale: 'css' },
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    reducedMotion: 'reduce',
    locale: 'ru-RU',
    timezoneId: 'Europe/Kiev',
  },
  projects: [
    shot('light-1280', 'light', 1280, 800),
    shot('dark-1280', 'dark', 1280, 800),
    shot('light-375', 'light', 375, 812, true),
    shot('dark-375', 'dark', 375, 812, true),
  ],
  webServer: {
    command: 'npm run dev:mock',
    port: PORT,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      MOCK_ALLOWED: 'qa-visual@example.invalid',
      // Часы учебного сервера (Node) — те же 14.10.2026 10:00 по Киеву, что и в браузере: выдуманные данные на эту дату
      NODE_OPTIONS: '--import ./tests/visual/fixed-date.mjs',
    },
  },
});
