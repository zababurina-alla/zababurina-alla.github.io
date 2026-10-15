// Как показывать имена клиентов в узких местах (строка таблицы, список ключей).
// Человек: «Соловей Тетяна Олександрівна» → «Соловей Тетяна» (отчество — в карточке).
// Организация (ТОВ, ПП, ФГ…, или есть кавычки): название целиком — «ТОВ «Чайка Сервіс Плюс»» нельзя резать на «ТОВ «Чайка».
// Граница слова — «не буква» по Unicode: \b в JS кириллицу не понимает («ТОВ Чайка» без кавычек не узнавался).
const ORG = /^(ТОВ|ТзОВ|ПП|ПрАТ|ПАТ|АТ|ФГ|СФГ|ОСББ|ГО|КП|ДП|ТДВ)(?!\p{L})|[«"]/u;

export function shortName(name: string): string {
  const n = name.trim().replace(/\s+/g, ' ');
  if (!n) return 'Без имени';
  if (ORG.test(n)) return n;
  return n.split(' ').slice(0, 2).join(' ');
}

/** Значение из таблицы, набранное заглавными («ПРИВАТ БАНК», «НАЛОГОВЫЙ»), — обычным регистром: заглавные кричат
 *  рядом с обычным текстом (находка «Пользователя» № 33). Короткие аббревиатуры (ТОВ, ДПС, АЦСК) не трогаем. */
const ABBR = new Set(['АЦСК', 'КНЕДП', 'ДФС', 'ДПС', 'ФОП', 'ТОВ']);

export function tidyCaps(value: string): string {
  const v = value.trim();
  const letters = v.replace(/[^\p{L}]/gu, '');
  if (letters.length < 5 || letters !== letters.toUpperCase()) return v;
  return v.split(/(\s+)/).map((w) => {
    const l = w.replace(/[^\p{L}]/gu, '');
    if (l.length <= 3 || ABBR.has(l)) return w; // аббревиатура
    return w.charAt(0) + w.slice(1).toLowerCase();
  }).join('');
}
