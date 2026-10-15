// «Напомнить клиенту» (clients.remind): мама видит текст сообщения, может поправить и только потом «Отправить».
// Уходит ровно то, что в поле. Клиентам пишем по-украински, как в боте. Ответ сервера — словами:
// ушло / нет бота / тестовый режим / не знаю, ушло ли / уже напоминали (с какого часа можно снова).
import { useEffect, useState } from 'react';
import { canWrite } from '../config';
import { useStore } from '../data/store';
import type { RemindRequest, RemindResult } from '../data/api';
import type { Client, DatedDeadline } from '../data/types';
import { fmtDate } from '../lib/dates';
import { Icon } from '../ui/Icon';
import { Modal } from '../ui/Modal';
import { roMessage } from '../ui/readonly';
import { useToast } from '../ui/toast';

/** Запасной черновик (украинский, без эмодзи), когда сервер не дал свой. Без имени: в обращении нужен звательный
 *  падеж («Ірино», не «Ірина») — его правильно строит сервер на языке клиента, не сайт. */
export function remindDraft(c: Client, about: { deadline?: DatedDeadline; key?: boolean }): string {
  const hi = 'Добрий день!';
  if (about.deadline) {
    const what = about.deadline.what.replace(/\p{Extended_Pictographic}️?/gu, '').trim();
    return `${hi} Нагадую: «${what}» — термін до ${fmtDate(about.deadline.due)}. Якщо вже все зроблено — дякую, просто напишіть мені.`;
  }
  if (about.key && c.keyUntil) {
    return `${hi} Ваш ключ ЕЦП діє до ${fmtDate(c.keyUntil)}. Його треба продовжити — напишіть, коли вам зручно.`;
  }
  return `${hi} `;
}

function resultText(r: RemindResult, name: string): { text: string; tone: 'ok' | 'info' | 'error' } {
  if (r.sent) return { text: `Напоминание ушло в Telegram: ${name}`, tone: 'ok' };
  if (r.reason === 'rateLimit') {
    const at = r.retryAt ? new Date(r.retryAt) : null;
    const when = at && !Number.isNaN(at.getTime()) ? ` — снова можно ${at.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}` : '';
    return { text: `${r.message}${when}`, tone: 'info' };
  }
  return { text: r.message, tone: r.reason === 'unknown' ? 'error' : 'info' };
}

export function RemindDialog({ open, onClose, client, deadline, keyReminder = false }: {
  open: boolean; onClose: () => void; client: Client; deadline?: DatedDeadline; keyReminder?: boolean;
}) {
  const store = useStore();
  const toast = useToast();
  const about = deadline ? { deadline } : { key: keyReminder };
  const [text, setText] = useState(() => remindDraft(client, about));
  const [edited, setEdited] = useState(false);
  const [sending, setSending] = useState(false);
  // Сервер заранее сказал, что не отправит (нет бота / тестовый клиент) — говорим сразу, «Отправить» не нужна.
  const [blocked, setBlocked] = useState<string | null>(null);
  const can = canWrite('remind');
  const kind: RemindRequest['kind'] = deadline ? 'deadline' : keyReminder ? 'key' : 'custom';
  // Черновик сервера (на языке клиента, как в боте) — если сервер умеет пробный запуск; свой украинский — запасной.
  const { remindPreview } = store;
  useEffect(() => {
    let alive = true;
    void remindPreview({ clientId: client.id, kind, ...(deadline ? { deadlineId: deadline.id } : {}) }).then((p) => {
      if (!alive || !p) return;
      if (p.preview) setText((cur) => (edited ? cur : p.preview ?? cur));
      if (p.reason === 'noBot') setBlocked(p.message ?? 'У клиента нет бота в Telegram — позвоните или напишите сами');
      else if (p.reason === 'test') setBlocked(p.message ?? 'Тестовый клиент — сообщение не уйдёт');
    });
    return () => { alive = false; };
    // edited читаем на момент ответа — повторно звать сервер из-за него не нужно
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id, kind, deadline, remindPreview]);
  const name = client.name.split(' ').slice(0, 2).join(' ');

  const send = async () => {
    if (!can) { toast({ text: roMessage('remind'), tone: 'info' }); return; }
    const req: RemindRequest = { clientId: client.id, kind, text: text.trim() };
    if (deadline) { req.deadlineId = deadline.id; if (deadline.periodEnd) req.period = deadline.periodEnd; }
    setSending(true);
    try {
      const r = await store.remindClient(req);
      const t = resultText(r, name);
      toast(t.tone === 'error' ? { text: t.text, tone: 'error' } : { text: t.text, tone: t.tone, timeout: 8000 });
      if (r.sent || r.reason !== 'unknown') onClose();
    } catch (e) {
      toast({ text: `Не отправилось: ${e instanceof Error && e.message ? e.message : 'таблица не ответила'}`, tone: 'error' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Напомнить: ${name}`} footer={
      <>
        <button type="button" className="btn btn--secondary" onClick={onClose}>Отмена</button>
        <button type="button" className="btn btn--primary btn--grow" disabled={sending || !text.trim() || blocked !== null} onClick={() => void send()}>
          {sending ? 'Отправляю…' : 'Отправить в Telegram'}</button>
      </>
    }>
      {blocked && <p className="remind__blocked" role="status"><Icon name="info" size={18} /><span>{blocked}</span></p>}
      <div className="field remind">
        <label className="field__label" htmlFor="remind-text">Сообщение клиенту — уйдёт ровно так</label>
        <textarea id="remind-text" className="input remind__text" rows={5} value={text} onChange={(e) => { setEdited(true); setText(e.target.value); }} />
        <p className="field__hint">Напоминание об одном и том же — не чаще раза в 12 часов. {can ? '' : roMessage('remind')}</p>
      </div>
    </Modal>
  );
}
