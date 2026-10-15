// Выбор нескольких сроков для «Закрыть N» (п. 5): «Сроки» включают режим, строки таблицы показывают флажок
// вместо круглой галочки. Вне «Сроков» режима нет — контекст по умолчанию выключен.
import { createContext, useContext } from 'react';

export interface DeadlineSelection { on: boolean; picked: ReadonlySet<string>; toggle: (id: string) => void }

export const SelectionCtx = createContext<DeadlineSelection>({ on: false, picked: new Set(), toggle: () => undefined });

export function useSelection(): DeadlineSelection {
  return useContext(SelectionCtx);
}
