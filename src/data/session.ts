// Один на страницу вход и один API: живой (когда задан адрес Apps Script) или выдуманный сервер.
import { useSyncExternalStore } from 'react';
import { GOOGLE_CLIENT_ID, apiUrl, isLive } from '../config';
import { Auth } from './auth';
import type { AuthState } from './auth';
import { LiveApi } from './liveApi';
import { fakeServer } from './fakeServer';
import type { CabinetApi } from './api';

// Модуль загружается после config.json (main.tsx): адрес уже известен.
export const auth: Auth | null = isLive() ? new Auth(apiUrl(), GOOGLE_CLIENT_ID) : null;
export const liveApi: LiveApi | null = auth ? new LiveApi(apiUrl(), auth) : null;
export const api: CabinetApi = liveApi ?? fakeServer;

const DEMO: AuthState = { status: 'signedIn', user: null, error: null };
const noop = () => () => undefined;

/** Состояние входа для экранов. На выдуманных данных — всегда «вошла», без пользователя. */
export function useAuth(): AuthState {
  return useSyncExternalStore(auth ? auth.subscribe : noop, auth ? auth.getState : () => DEMO);
}
