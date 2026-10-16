// «📤 Ссылка для клиента (бот)» (clients.botLink): одноразовая ссылка /start client_… на 7 дней — клиент открывает её и
// подключается к боту. Каждый вызов делает НОВУЮ ссылку и гасит прежнюю, поэтому — только по кнопке, не при показе карточки.
// Ссылка — ключ входа клиента: живёт только в этом компоненте, пока карточка открыта (не в localStorage и не в логах).
import { useState } from 'react';
import { useStore } from '../data/store';
import { fmtDate } from '../lib/dates';
import { Icon } from '../ui/Icon';

export function BotLink({ clientId }: { clientId: string }) {
  const store = useStore();
  const [state, setState] = useState<{ kind: 'idle' | 'busy' } | { kind: 'link'; link: string; expiresAt: string | null } | { kind: 'connected' } | { kind: 'error'; text: string }>({ kind: 'idle' });
  const [copied, setCopied] = useState(false);
  const get = store.botLink;
  if (!get) return null;

  async function make() {
    if (!get) return;
    setState({ kind: 'busy' }); setCopied(false);
    try {
      const r = await get(clientId);
      setState(r.connected ? { kind: 'connected' } : r.link ? { kind: 'link', link: r.link, expiresAt: r.expiresAt } : { kind: 'error', text: 'Таблица не дала ссылку — попробуйте ещё раз' });
    } catch (e) {
      setState({ kind: 'error', text: e instanceof Error && e.name === 'ApiError' ? e.message : 'Таблица не ответила — попробуйте ещё раз' });
    }
  }

  async function copy(link: string) {
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); }
  }

  if (state.kind === 'connected') return <p className="sub">Клиент уже в боте — новая ссылка не нужна.</p>;
  if (state.kind === 'link') {
    return (
      <div className="botlink">
        <input className="input input--sm num" readOnly value={state.link} aria-label="Ссылка для подключения к боту" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => { void copy(state.link); }}><Icon name="copy" size={16} />{copied ? 'Скопировано' : 'Копировать'}</button>
        <p className="sub">Отправьте клиенту — одна ссылка{state.expiresAt ? `, действует до ${fmtDate(state.expiresAt.slice(0, 10))}` : ''}. Новая ссылка гасит эту.</p>
      </div>
    );
  }
  return (
    <div className="botlink">
      <button type="button" className="btn btn--secondary btn--sm" disabled={state.kind === 'busy'} onClick={() => { void make(); }}>
        <Icon name="share" size={16} />{state.kind === 'busy' ? 'Делаю ссылку…' : 'Ссылка для бота'}</button>
      {state.kind === 'error' && <p className="field__error" role="alert">{state.text}</p>}
    </div>
  );
}
