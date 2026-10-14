// Типы данных кабинета. На этапе 3 станут частью контракта API; поля названы так, как их будет отдавать сервер.

export type Status = 'red' | 'orange' | 'yellow' | 'green' | 'grey';

/** Состояние записи относительно таблицы (бриф, п. 6): «сохранено» — только после ответа сервера. */
export type SaveState = 'saving' | 'saved' | 'failed';

export type ClientKind = 'fop1' | 'fop2' | 'fop3' | 'general' | 'tov';

export interface Client {
  id: string;
  name: string;
  kind: ClientKind;
  employer: boolean;
  kved: { code: string; title: string }[];
  phone: string;
  bank: string;
  keyUntil: string | null; // ISO
  /** Начисления в месяц, копейки; считает сервер по справочнику ставок. */
  monthly: { name: string; kopecks: number; note: string }[];
  version: number;
}

export interface Deadline {
  id: string;
  clientId: string;
  what: string;
  due: string; // ISO
  kopecks: number | null;
  /** Отчётный период ещё не закончился — закрыть нельзя (проверка и здесь, и на сервере). */
  periodEnds: string | null; // ISO, день после окончания периода
  version: number;
}

export interface Payment {
  id: string;
  clientId: string;
  kopecks: number;
  period: string;
  method: string;
  date: string; // ISO
  source: 'сайт' | 'бот' | 'таблица';
  save?: SaveState;
}

export interface Activity {
  id: string;
  when: string; // ISO date-time
  source: 'сайт' | 'бот' | 'таблица';
  text: string;
}
