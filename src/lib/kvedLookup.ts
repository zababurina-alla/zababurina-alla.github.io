// Название (и ставка) КВЕД по коду — тем же откатом, что таблица (_kvedLookup, mama_apps_script_v4.js:8378):
// точный код → группа «XX.X» → раздел «XX». В листе «📑 КВЕДы» многие коды записаны группами (42.9, 43.2, 46), у клиентов —
// классами (42.99, 43.21, 46.69); без отката сайт писал «название не указано» (координатор 16.10).
// Это читалка: корпус «код клиента → строка листа» и «верно N из M» — в kvedLookup.test.ts.

/** Как _kvedNormalizeCode: пробелы по краям; у кода с точкой — без нулей в конце и без точки в конце («56.10» → «56.1»). */
export function normalizeKved(code: string): string {
  const s = String(code || '').trim();
  if (!s.includes('.')) return s;
  return s.replace(/0+$/, '').replace(/\.$/, '');
}

/** Карта по нормализованным кодам листа. */
export function kvedMap<T>(rows: readonly T[], codeOf: (r: T) => string): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of rows) { const k = normalizeKved(codeOf(r)); if (k && !m.has(k)) m.set(k, r); }
  return m;
}

/** Точный код → «XX.X» → «XX»; нет нигде — undefined. */
export function kvedLookup<T>(map: ReadonlyMap<string, T>, code: string): T | undefined {
  const key = normalizeKved(code);
  if (!key) return undefined;
  const exact = map.get(key);
  if (exact !== undefined) return exact;
  const dot = key.indexOf('.');
  if (dot > 0 && key.length > dot + 2) {
    const parent = map.get(key.substring(0, dot + 2));
    if (parent !== undefined) return parent;
  }
  if (dot > 0) return map.get(key.substring(0, dot));
  return undefined;
}
