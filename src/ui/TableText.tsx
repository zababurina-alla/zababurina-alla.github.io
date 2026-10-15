// Текст из таблицы на сайте: ведущий эмодзи («📝 Декларація…», «✅ Сдано») заменяется своим нарисованным значком —
// по колонке «Таблица» словаря (docs/словарь-значков.md, п. 3). Остальной текст — как пришёл, ничего не переписываем.
// Неизвестный эмодзи остаётся текстом: честнее показать как есть, чем угадать. В таблице и в боте эмодзи остаются.
import type { IconName } from './Icon';
import { Icon } from './Icon';
import { tidyCaps } from './names';

export const EMOJI_ICON: Record<string, IconName> = {
  '📊': 'today', '👤': 'fop', '⏰': 'deadlines', '🧩': 'tasks', '💰': 'payments', '🔐': 'keys', '📑': 'kved',
  '🗓': 'month', '👥': 'staff', '💵': 'salary', '🧮': 'calculator', '💬': 'consult', '❓': 'questions', '🩺': 'audit',
  '🗄': 'archive', '🔍': 'search', '📝': 'declaration', '💲': 'vat', '🏠': 'property', '🌾': 'land', '🛢': 'excise',
  '☂': 'esv', '🛡': 'vz', '⚖': 'balance', '💼': 'fopGeneral', '🏢': 'tov', '🙂': 'person', '🌍': 'nonresident',
  '🤖': 'bot', '🏦': 'bank', '🏛': 'taxOffice', '📱': 'diia', '🪙': 'cash', '💳': 'card', '🔁': 'transfer',
  '🆕': 'statusNew', '🔄': 'inProgress', '⌛': 'waiting', '⏸': 'postponed', '✅': 'done', '⬜': 'notStarted',
  '◐': 'partial', '❌': 'notReceived', '↩': 'returned', '🔴': 'overdue', '🟠': 'burning', '🟡': 'soon', '🟢': 'ok',
  '⚪': 'inactive', '🔥': 'critical', '⬆': 'high', '➖': 'medium', '⬇': 'low', '📁': 'documents', '📞': 'call',
  '🔔': 'remindPay', '🛑': 'auditCritical', '⚠': 'warning', 'ℹ': 'info', '⛔': 'checkFailed', '🧾': 'receipt',
  '📤': 'sent', '✏': 'edited', '☀': 'morning', '🚨': 'attention', '🌙': 'evening', '📋': 'weekly', '📰': 'news',
  '💡': 'tip', '📧': 'email', '🔑': 'password', '📅': 'date', '⏳': 'daysLeft', '📈': 'income', '🗂': 'clientCard',
  '⏭': 'later', '📄': 'pdf', '💾': 'backup', '🎤': 'mic', '📷': 'camera',
};

// Цвет значка — по смыслу: срочность и статусы — цветом шкалы, остальное — тихо.
const TONE: Partial<Record<IconName, string>> = {
  overdue: 'urgency--red', burning: 'urgency--orange', soon: 'urgency--yellow', ok: 'urgency--green', inactive: 'urgency--grey',
  done: 'urgency--green', critical: 'prio--critical', high: 'prio--high', warning: 'urgency--orange', auditCritical: 'urgency--red',
};

const LEAD = /^\s*(\p{Extended_Pictographic}|[◐⬜➖])(️|‍\p{Extended_Pictographic}️?)*\s*/u;

/** Разобрать ведущий эмодзи: значок (если он в словаре) и текст без эмодзи. */
export function splitEmoji(text: string): { icon: IconName | null; rest: string } {
  const m = LEAD.exec(text);
  if (!m?.[1]) return { icon: null, rest: text };
  const icon = EMOJI_ICON[m[1]] ?? null;
  return icon ? { icon, rest: text.slice(m[0].length) } : { icon: null, rest: text };
}

/** Текст из таблицы со своим значком вместо ведущего эмодзи. fallback — значок, если эмодзи нет (вид отчёта). */
export function TableText({ text, fallback, size = 18, prefer = 'emoji', icon: showIcon = true, tidy = false }: {
  text: string; fallback?: IconName | undefined; size?: number; prefer?: 'emoji' | 'fallback';
  /** false — значок не рисуем (рядом уже есть свой, например срочность), известный эмодзи просто убираем */
  icon?: boolean;
  /** «НАЛОГОВЫЙ» → «Налоговый» (tidyCaps) — для значений, набранных в таблице заглавными */
  tidy?: boolean;
}) {
  const { icon, rest } = splitEmoji(text);
  // prefer="fallback" — значок по смыслу записи (вид отчёта) важнее эмодзи из таблицы: эмодзи там бывает не по словарю.
  const lead = LEAD.exec(text);
  const clean = prefer === 'fallback' && fallback && lead ? text.slice(lead[0].length) : rest;
  const name = prefer === 'fallback' ? (fallback ?? icon) : (icon ?? fallback);
  const body = prefer === 'fallback' ? clean : rest;
  const shown = tidy ? tidyCaps(body) : body;
  if (!showIcon) return <span className="ttext ttext--plain">{shown}</span>;
  return (
    <span className="ttext">
      {name && <Icon name={name} size={size} className={`ttext__icon ${TONE[name] ?? ''}`} />}
      <span>{shown}</span>
    </span>
  );
}
