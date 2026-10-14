// Общие окна, которые открываются отовсюду: записать платёж, добавить клиента, карточка клиента.
import { createContext, useContext } from 'react';

export interface UiApi {
  openPayment: (clientId?: string) => void;
  openAddClient: () => void;
  openClient: (id: string) => void;
}

export const UiCtx = createContext<UiApi>({ openPayment: () => undefined, openAddClient: () => undefined, openClient: () => undefined });

export function useUi(): UiApi {
  return useContext(UiCtx);
}
