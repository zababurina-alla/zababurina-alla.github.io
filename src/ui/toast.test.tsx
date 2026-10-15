// Уведомления видны после того, как окно (карточка клиента) исчезло со страницы: раньше слой оставался в удалённом
// <dialog>, и все подсказки и ошибки пропадали до перезагрузки (живой сайт, 15.10.2026).
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { ToastProvider, useToast } from './toast';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

describe('слой уведомлений', () => {
  it('окно удалили со страницы — уведомление снова в документе', async () => {
    const dlg = document.createElement('dialog');
    dlg.setAttribute('open', '');
    document.body.append(dlg);
    let push: ReturnType<typeof useToast> = () => undefined;
    function Grab() { const t = useToast(); useEffect(() => { push = t; }, [t]); return null; }
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => { root.render(<ToastProvider><Grab /></ToastProvider>); });
    expect(dlg.querySelector('.toasts')).not.toBeNull();
    await act(async () => { dlg.remove(); await frame(); await frame(); });
    await act(async () => { push({ text: 'Сроки пока закрывайте в таблице', tone: 'info' }); });
    const layer = document.querySelector('.toasts');
    expect(layer?.isConnected).toBe(true);
    expect(layer?.textContent).toContain('пока закрывайте');
    act(() => root.unmount());
  });
});
