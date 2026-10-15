// Текст из таблицы на сайте: ведущий эмодзи («📝 Декларація…», «✅ Сдано») заменяется своим нарисованным значком —
// по колонке «Таблица» словаря (docs/словарь-значков.md, п. 3). Остальной текст — как пришёл, ничего не переписываем.
// Неизвестный эмодзи остаётся текстом: честнее показать как есть, чем угадать. В таблице и в боте эмодзи остаются.
import type { IconName } from './Icon';
import { Icon } from './Icon';

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
export function TableText({ text, fallback, size = 18 }: { text: string; fallback?: IconName; size?: number }) {
  const { icon, rest } = splitEmoji(text);
  const name = icon ?? fallback;
  return (
    <span className="ttext">
      {name && <Icon name={name} size={size} className={`ttext__icon ${TONE[name] ?? ''}`} />}
      <span>{rest}</span>
    </span>
  );
}
