// «Установить на экран» (PWA). Chrome/Android присылает beforeinstallprompt — ловим его сразу при загрузке и держим
// до нажатия кнопки в «Ещё». У iPhone такого события нет: там подсказка «Поделиться → На экран „Домой“».
// Сервис-воркер регистрируем только в собранном сайте (в разработке он мешал бы правкам).
import { useSyncExternalStore } from 'react';

interface InstallPrompt extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: InstallPrompt | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

export function standalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches === true
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** iPhone/iPad в Safari (не установлено): подсказка про «На экран „Домой“». iPadOS выдаёт себя за Mac — по касаниям. */
export function iosNeedsHint(): boolean {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return ios && !standalone();
}

export function initInstall(): void {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as InstallPrompt; emit(); });
  window.addEventListener('appinstalled', () => { deferred = null; installed = true; emit(); });
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    void navigator.serviceWorker.register('./sw.js').catch(() => undefined); // без воркера сайт работает как раньше
  }
}

export type InstallState = 'installed' | 'prompt' | 'ios' | 'none';

function state(): InstallState {
  if (installed || standalone()) return 'installed';
  if (deferred) return 'prompt';
  if (iosNeedsHint()) return 'ios';
  return 'none';
}

export function useInstall(): { state: InstallState; install: () => Promise<boolean> } {
  const st = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, state);
  const install = async () => {
    if (!deferred) return false;
    const p = deferred;
    deferred = null;
    await p.prompt();
    const { outcome } = await p.userChoice;
    if (outcome === 'accepted') installed = true;
    emit();
    return outcome === 'accepted';
  };
  return { state: st, install };
}
