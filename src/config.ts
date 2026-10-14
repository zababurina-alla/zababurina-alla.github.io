// Настройки подключения к живой таблице. Оба значения публичные по природе: адрес веб-приложения и client ID
// всё равно видны в коде страницы. Секретов здесь нет и быть не должно (контракт, раздел 3: список почт — на сервере).
// Пока API_URL пуст — сайт работает на выдуманном сервере (src/data/fakeServer.ts).

/** POST-адрес Apps Script: https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec */
export const API_URL = '';

/** OAuth client ID проекта Google Cloud «zababurina-alla» (…apps.googleusercontent.com). */
export const GOOGLE_CLIENT_ID = '1078049272948-bnvonl9qah7npdq63gktbio1rm2lbgvb.apps.googleusercontent.com';

/** Живой режим: адрес задан и не включён показ на выдуманных данных (?demo=1). */
export function isLive(): boolean {
  if (!API_URL || !GOOGLE_CLIENT_ID) return false;
  try {
    return new URLSearchParams(window.location.search).get('demo') !== '1';
  } catch {
    return true;
  }
}
