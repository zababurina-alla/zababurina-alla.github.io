// Визуальные снимки: «сейчас» в процессе учебного сервера (vite --mode mock) — 14.10.2026 10:00 по Киеву, ход идёт от
// старта (таймеры и сравнения времени работают). Только для npm run visual: подключается через NODE_OPTIONS из
// playwright.config.ts. Выдуманные данные (src/data/fake.ts) рассчитаны на эту дату.
const FIXED = Date.parse('2026-10-14T10:00:00+03:00');
const START = Date.now();
const RealDate = Date;

class FixedDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(FIXED + (RealDate.now() - START));
    else super(...args);
  }
  static now() { return FIXED + (RealDate.now() - START); }
}
globalThis.Date = FixedDate;
