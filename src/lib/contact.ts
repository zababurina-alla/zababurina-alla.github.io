// Проверка телефона и почты до отправки в таблицу (clients.update, контракт v2.2): те же правила, что у сервера,
// чтобы мама увидела ошибку сразу, а не через 5 с ответа. Привести телефон к «📞 +380 (50) 123-45-67» — дело сервера.

/** Пусто — очистить поле (сервер запишет null). Иначе 9–15 цифр в любом написании: «050 123 45 67», «+38 (050)…». */
export function phoneProblem(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  if (/[^\d\s+()\-.]/.test(t)) return 'В телефоне только цифры, пробелы, «+», скобки и дефисы';
  const n = t.replace(/\D/g, '').length;
  if (n < 9 || n > 15) return `В телефоне ${n} ${n === 1 ? 'цифра' : n < 5 && n > 1 ? 'цифры' : 'цифр'} — нужно от 9 до 15`;
  return null;
}

/** Почта — нижним регистром (так её ждёт сервер); пусто — очистить. */
export function normEmail(v: string): string {
  return v.trim().toLowerCase();
}

export function emailProblem(v: string): string | null {
  const t = normEmail(v);
  if (!t) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t) ? null : 'Почта выглядит так: имя@домен.ua';
}

/** Чат с клиентом в Telegram по телефону: t.me/+380… (откроет приложение, если номер там есть). Украинский номер
 *  «050…» (10 цифр с нулём) — с кодом страны 38. Не похоже на телефон — null. Находка «Пользователя» № 22. */
export function telegramLink(phone: string | null | undefined): string | null {
  // В клетке бывает «📞 +380 …» (так пишет сервер) и два номера через запятую — эмодзи впереди отрезаем, берём первый.
  const t = ((phone ?? '').split(/[,;]|\s{2,}/)[0] ?? '').replace(/^[^\d+(]+/, '').trim();
  if (!t || phoneProblem(t)) return null;
  let d = t.replace(/\D/g, '');
  if (d.length === 10 && d.startsWith('0')) d = `38${d}`;
  else if (d.length === 9) d = `380${d}`;
  return d.length >= 11 && d.length <= 15 ? `https://t.me/+${d}` : null;
}
