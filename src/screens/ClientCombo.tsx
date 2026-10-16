// Выбор клиента поиском — как в «Записать платёж» (приёмка «Пользователя» С-3, 16.10: в «Новом сроке» был системный список
// на 116 фамилий без поиска). Любой падеж, украинские и русские буквы, раскладка — та же читалка lib/search.
// Найден один и ушли из поля — он и выбран (находка № 5). Оформление — классы .combo / .picked, как у платежа.
import { useId, useRef, useState } from 'react';
import { useStore } from '../data/store';
import { search } from '../lib/search';
import { Icon } from '../ui/Icon';
import { Avatar } from '../ui/kit';

export function ClientCombo({ value, onChange, error }: { value: string; onChange: (id: string) => void; error?: string }) {
  const store = useStore();
  const ids = useId();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const picked = value ? store.client(value) : undefined;
  const found = q.trim() ? search(store.clients.map((c) => ({ ...c, extra: [c.phone] })), q).slice(0, 6) : [];
  const only = found.length === 1 ? found[0] : undefined;

  if (picked) {
    return (
      <div className="picked">
        <Avatar name={picked.name} size="sm" />
        <span className="picked__name">{picked.name}</span>
        <button type="button" className="link" onClick={() => { onChange(''); setQ(''); setTimeout(() => input.current?.focus(), 0); }}>Другой</button>
      </div>
    );
  }
  return (
    <div className="combo">
      <span className="combo__icon"><Icon name="search" /></span>
      <input id={`${ids}-q`} ref={input} className="input input--icon" value={q} autoComplete="off" role="combobox"
        aria-expanded={found.length > 0} aria-controls={`${ids}-list`} aria-activedescendant={found.length ? `${ids}-opt-${active}` : undefined}
        aria-invalid={Boolean(error)} aria-label="Клиент" placeholder="Начните фамилию — в любом падеже…"
        onChange={(e) => { setQ(e.target.value); setActive(0); }}
        onBlur={() => { if (only) onChange(only.id); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, found.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === 'Enter') { e.preventDefault(); const s = found[active]; if (s) onChange(s.id); }
        }} />
      {q.trim() && (
        <ul id={`${ids}-list`} className="combo__list" role="listbox" aria-label="Найденные клиенты">
          {found.map((s, i) => (
            <li key={s.id} id={`${ids}-opt-${i}`} role="option" aria-selected={i === active} className="combo__opt"
              onMouseDown={(e) => { e.preventDefault(); onChange(s.id); }}>
              <Avatar name={s.name} size="sm" />{s.name}
            </li>
          ))}
          {!found.length && <li className="combo__hint sub" role="presentation">Никого не нашли</li>}
        </ul>
      )}
    </div>
  );
}
