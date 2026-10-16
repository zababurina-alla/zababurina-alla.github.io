// Шаблоны задач — как меню таблицы «✨ Шаблоны задач» (TASK_TEMPLATES в Apps Script): тот же текст, вид, важность и срок.
import type { Priority, TaskType } from '../data/types';

export interface TaskTemplate { key: string; label: string; text: string; type: TaskType; priority: Priority; daysAhead: number }

export const TASK_TEMPLATES: readonly TaskTemplate[] = [
  { key: 'CALL', label: 'Перезвонить', text: '📞 Перезвонить, уточнить детали', type: 'consult', priority: 'medium', daysAhead: 1 },
  { key: 'DOCS_REQUEST', label: 'Первичка', text: '📄 Запросить первичные документы', type: 'docs', priority: 'medium', daysAhead: 3 },
  { key: 'KEY_RENEW', label: 'Ключ ЭЦП', text: '🔐 Проверить/продлить ключ', type: 'key', priority: 'high', daysAhead: 7 },
  { key: 'PAYMENT_REMIND', label: 'Оплата', text: '💰 Напомнить об оплате', type: 'consult', priority: 'high', daysAhead: 3 },
  { key: 'REPORT_PREP', label: 'Отчёт', text: '📊 Подготовить отчёт', type: 'report', priority: 'medium', daysAhead: 5 },
  { key: 'BANK_CHECK', label: 'Выписка банка', text: '🏦 Сверить выписку банка', type: 'docs', priority: 'low', daysAhead: 2 },
];
