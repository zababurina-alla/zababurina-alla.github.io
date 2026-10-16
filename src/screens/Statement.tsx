// «Выписка» клиента (меню таблицы «📜 PDF-выписка клиенту» и «📤 Отправить выписку в Telegram»).
// PDF — новый файл в Drive при каждом нажатии, собирается несколько секунд; ссылку показываем, открывает мама (окна,
// открытые после ожидания, браузер блокирует). Отправка — как напоминание: сначала подпись на языке клиента, потом
// «Отправить»; лимит 12 ч на клиента общий с напоминаниями. В PDF есть логин клиента (не пароль) — как в меню таблицы.
import { useState } from 'react';
import { useStore } from '../data/store';
import type { StatementResult } from '../data/api';
import { Icon } from '../ui/Icon';

function sentText(r: StatementResult): string {
  if (r.sent) return 'Выписка ушла клиенту в Telegram';
  if (r.reason === 'rateLimit') {
    const at = r.retryAt ? new Date(r.retryAt) : null;
    const when = at && !Number.isNaN(at.getTime()) ? ` — снова можно ${at.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}` : '';
    return `${r.message}${when}`;
  }
  return r.message;
}

export function StatementBlock({ clientId }: { clientId: string }) {
  const { statement } = useStore();
  const [pdf, setPdf] = useState<{ kind: 'idle' | 'busy' } | { kind: 'ready'; url: string; fileName: string } | { kind: 'error'; text: string }>({ kind: 'idle' });
  const [send, setSend] = useState<{ kind: 'idle' | 'loading' } | { kind: 'preview' | 'sending'; text: string } | { kind: 'done'; text: string; tone: 'ok' | 'info' | 'error' }>({ kind: 'idle' });
  if (!statement.pdf && !statement.preview) return null;
  const err = (e: unknown) => (e instanceof Error && e.name === 'ApiError' ? e.message : 'Таблица не ответила — попробуйте ещё раз');

  async function makePdf() {
    if (!statement.pdf) return;
    setPdf({ kind: 'busy' });
    try { const r = await statement.pdf(clientId); setPdf({ kind: 'ready', url: r.url, fileName: r.fileName }); } catch (e) { setPdf({ kind: 'error', text: err(e) }); }
  }
  async function preview() {
    if (!statement.preview) return;
    setSend({ kind: 'loading' });
    try {
      const p = await statement.preview(clientId);
      // Нет бота / тестовый клиент — не ошибка, а спокойное «так нельзя» (дизайн 16.10): красным только сбой.
      setSend(p.preview ? { kind: 'preview', text: p.preview } : { kind: 'done', text: p.message ?? 'Отправить нельзя', tone: 'info' });
    } catch (e) { setSend({ kind: 'done', text: err(e), tone: 'error' }); }
  }
  async function doSend() {
    if (!statement.send || send.kind !== 'preview') return;
    setSend({ kind: 'sending', text: send.text });
    try {
      const r = await statement.send(clientId);
      setSend({ kind: 'done', text: sentText(r), tone: r.sent ? 'ok' : r.reason === 'unknown' ? 'error' : 'info' });
    } catch (e) { setSend({ kind: 'done', text: err(e), tone: 'error' }); }
  }

  return (
    <section className="cp__block statement" aria-label="Выписка клиента">
      <h3 className="cp__h">Выписка</h3>
      <div className="statement__row">
        {statement.pdf && (pdf.kind === 'ready'
          ? <a className="btn btn--secondary btn--sm" href={pdf.url} target="_blank" rel="noopener noreferrer" title={pdf.fileName}><Icon name="pdf" size={16} />Открыть PDF</a>
          : <button type="button" className="btn btn--secondary btn--sm" disabled={pdf.kind === 'busy'} onClick={() => { void makePdf(); }}>
            <Icon name="pdf" size={16} />{pdf.kind === 'busy' ? 'Собираю выписку…' : 'PDF-выписка'}</button>)}
        {statement.preview && (send.kind === 'idle' || send.kind === 'loading') && (
          <button type="button" className="btn btn--ghost btn--sm" disabled={send.kind === 'loading'} onClick={() => { void preview(); }}>
            <Icon name="sent" size={16} />{send.kind === 'loading' ? 'Готовлю…' : 'Отправить клиенту'}</button>
        )}
      </div>
      {pdf.kind === 'ready' && <p className="sub">Готово: {pdf.fileName}. В выписке есть логин клиента — пересылайте только ему.</p>}
      {pdf.kind === 'error' && <p className="field__error" role="alert">{pdf.text}</p>}
      {(send.kind === 'preview' || send.kind === 'sending') && (
        <div className="statement__send">
          <p className="sub">Клиент получит PDF с подписью:</p>
          <blockquote className="statement__quote">{send.text}</blockquote>
          <button type="button" className="btn btn--primary btn--sm" disabled={send.kind === 'sending'} onClick={() => { void doSend(); }}>
            {send.kind === 'sending' ? 'Отправляю…' : 'Отправить в Telegram'}</button>
          <button type="button" className="btn btn--ghost btn--sm" disabled={send.kind === 'sending'} onClick={() => setSend({ kind: 'idle' })}>Отмена</button>
        </div>
      )}
      {send.kind === 'done' && <p className={send.tone === 'error' ? 'field__error' : 'sub'} role={send.tone === 'error' ? 'alert' : 'status'}>{send.text}</p>}
    </section>
  );
}
