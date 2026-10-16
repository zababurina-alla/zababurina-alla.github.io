// Приветствие на «Сегодня» — по часам Киева, а не компьютера (владелец 17.10: «Доброе утро» в 00:30 ночи).
// 05–12 утро, 12–18 день, 18–23 вечер, 23–05 ночь.

/** Час в Киеве (0–23) для момента d: летом UTC+3, зимой UTC+2 — переход считает сам браузер. */
export function kyivHour(d: Date = new Date()): number {
  for (const timeZone of ['Europe/Kyiv', 'Europe/Kiev']) {
    try {
      const h = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).formatToParts(d)
        .find((p) => p.type === 'hour')?.value;
      if (h !== undefined) return Number(h) % 24;
    } catch { /* старое название пояса — пробуем следующее */ }
  }
  return d.getHours();
}

export function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Доброе утро';
  if (hour >= 12 && hour < 18) return 'Добрый день';
  if (hour >= 18 && hour < 23) return 'Добрый вечер';
  return 'Доброй ночи';
}
