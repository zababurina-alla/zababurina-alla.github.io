// Вопросы, на которые ответили в этом сеансе (флаг answerReplace): отвеченные в снимок не приходят, а «Изменить» должен
// снова показать вопрос с прежними вариантами или полем. Держим их в памяти страницы — после перезагрузки менять
// ответ с сайта нельзя (и это нормально). Какие из них сейчас открыты на изменение — тоже здесь.
import { useSyncExternalStore } from 'react';
import type { Question } from '../data/types';

export interface Answered { q: Question; answer: string }

const listeners = new Set<() => void>();
const answered = new Map<string, Answered>();
let editing: string[] = [];
let snapshot: Answered[] = [];

function emit(): void {
  const next = editing.flatMap((id) => answered.get(id) ?? []);
  if (next.length !== snapshot.length || next.some((x, i) => x !== snapshot[i])) snapshot = next; // та же картина — не перерисовывать
  listeners.forEach((l) => l());
}

/** Вопрос отвечен (или ответ заменён) на этом сайте. */
export function rememberAnswered(q: Question, answer: string): void {
  answered.set(q.id, { q: { ...q, options: [...q.options] }, answer });
  emit();
}

/** Ответ отменён или не записался — вопрос снова обычный. */
export function forgetAnswered(id: string): void {
  answered.delete(id);
  editing = editing.filter((x) => x !== id);
  emit();
}

/** «Изменить»: показать вопрос снова. Не отвеченный на этом сайте (после перезагрузки) — нечего показывать. */
export function startEdit(id: string): boolean {
  if (!answered.has(id)) return false;
  if (!editing.includes(id)) editing = [...editing, id];
  emit();
  return true;
}

export function stopEdit(id: string): void {
  editing = editing.filter((x) => x !== id);
  emit();
}

/** Вопросы, открытые на изменение ответа. */
export function useEditing(): Answered[] {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => snapshot, () => snapshot);
}

/** Для тестов: забыть всё. */
export function resetAnswered(): void {
  answered.clear(); editing = []; emit();
}
