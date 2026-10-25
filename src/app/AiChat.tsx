// Помощник (ai.ask, флаг aiChat): кнопка (в углу; в виде A — в шапке/меню) → панель с перепиской. Если открыта карточка клиента — вопрос уходит
// с его clientId. История — только в памяти вкладки (компонент живёт, пока открыт сайт): на сервере вопросы не хранятся,
// в localStorage / IndexedDB не пишем. Ответ — простым текстом (без разметки). Оформление — за отделом дизайна.
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../data/store';
import { isLookA } from '../lib/look';
import { Icon } from '../ui/Icon';
import { shortName } from '../ui/names';

/** refusal — помощник отказался (не по теме, нет данных): спокойной репликой, не ошибкой (контракт «Бота»). */
interface Msg { id: number; who: 'me' | 'bot' | 'refusal' | 'err'; text: string; about?: string; sources?: string[] }

const LONG_MS = 20_000; // дольше — сервер отвечает через ai.result: маме — что ответ придёт сюда

export function AiChat({ clientId }: { clientId: string | null }) {
  const store = useStore();
  const ask = store.aiAsk;
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState('');
  const [thinking, setThinking] = useState(false);
  const [off, setOff] = useState<string | null>(null);
  const [long, setLong] = useState(false);
  const list = useRef<HTMLOListElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const client = clientId ? store.client(clientId) : undefined;
  // Вид A: кнопка не плавает над страницей, а стоит в шапке телефона и в меню ноутбука — места [data-ai-slot] в Shell
  // (в каждом по одному, лишнее скрыто стилем). Нет мест (оболочки нет) — как раньше, плавающей.
  const [slots, setSlots] = useState<HTMLElement[]>([]);
  // Места появляются в DOM вместе с этим кадром (Shell рядом) — читаем их после вставки, до отрисовки.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useLayoutEffect(() => { if (isLookA()) setSlots([...document.querySelectorAll<HTMLElement>('[data-ai-slot]')]); }, []);

  // Новое сообщение — лента к низу; открыли — курсор в поле.
  useEffect(() => { const el = list.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'instant' }); }, [msgs, thinking, open]);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => {
    if (!thinking) return;
    const t = window.setTimeout(() => setLong(true), LONG_MS);
    return () => { window.clearTimeout(t); setLong(false); };
  }, [thinking]);
  if (!ask) return null;

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const text = q.trim();
    if (!text || thinking || !ask) return;
    const about = client ? shortName(client.name) : undefined;
    setMsgs((m) => [...m, { id: Date.now(), who: 'me', text, ...(about ? { about } : {}) }]);
    setQ(''); setThinking(true);
    try {
      const r = await ask(text, client ? client.id : null);
      if (r.ok) setMsgs((m) => [...m, { id: Date.now() + 1, who: r.kind === 'refusal' ? 'refusal' : 'bot', text: r.answer, sources: r.sources }]);
      else {
        if (r.reason === 'off') setOff(r.message);
        setMsgs((m) => [...m, { id: Date.now() + 1, who: 'err', text: r.message }]);
      }
    } finally {
      setThinking(false);
    }
  }

  const fab = (
    <button type="button" className={`ai-fab${slots.length ? ' ai-fab--slot' : ''}${open ? ' is-open' : ''}`} aria-expanded={open} aria-controls={`${ids}-panel`}
      aria-label={open ? 'Закрыть помощника' : 'Спросить помощника'} title="Помощник: спросите о клиенте, сроке или налоге"
      onClick={() => setOpen((o) => !o)}><Icon name={open ? 'close' : 'assistant'} size={22} /></button>
  );

  return (
    <>
      {slots.length ? slots.map((slot, i) => createPortal(fab, slot, `ai-fab-${i}`)) : fab}
      {open && (
        <section id={`${ids}-panel`} className="ai-panel" role="dialog" aria-label="Помощник" onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}>
          <header className="ai-panel__head">
            <h2 className="ai-panel__title">Помощник</h2>
            <button type="button" className="icon-btn" aria-label="Закрыть помощника" onClick={() => setOpen(false)}><Icon name="close" size={18} /></button>
          </header>
          <ol ref={list} className="ai-msgs" aria-live="polite">
            {!msgs.length && <li className="ai-msg ai-msg--hint sub">Спросите о клиенте, сроке, налоге или ставке. Переписка не сохраняется — закроете вкладку, и она исчезнет.</li>}
            {msgs.map((m) => (
              <li key={m.id} className={`ai-msg ai-msg--${m.who}`}>
                {m.about && <span className="ai-msg__about sub">о клиенте {m.about}</span>}
                <p className="ai-msg__text">{m.text}</p>
                {m.sources && m.sources.length > 0 && <span className="ai-msg__src sub">По данным: {m.sources.join(', ')}</span>}
              </li>
            ))}
            {thinking && <li className="ai-msg ai-msg--wait" role="status"><span className="ai-dots" aria-hidden="true" />
              {long ? 'Думает дольше обычного — ответ придёт сюда, вкладку можно не закрывать' : 'Думает…'}</li>}
          </ol>
          <form className="ai-form" onSubmit={(e) => { void send(e); }}>
            {client && <span className="ai-form__about sub">Вопрос о клиенте: <strong>{shortName(client.name)}</strong></span>}
            <textarea ref={input} className="input ai-form__q" rows={2} value={q} maxLength={1000} disabled={Boolean(off)}
              placeholder={off ?? 'Например: что сдать на этой неделе?'} aria-label="Вопрос помощнику"
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} />
            <button type="submit" className="btn btn--primary btn--sm" disabled={!q.trim() || thinking || Boolean(off)}>{thinking ? 'Думает…' : 'Спросить'}</button>
          </form>
        </section>
      )}
    </>
  );
}
